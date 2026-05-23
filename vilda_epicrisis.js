/* ==========================================================================
 * VildaEpicrisis — silnik generowania epikryzy medycznej
 *
 * EC-1: pomocniki formatowania tekstu medycznego (wiek, SDS, centyle, GH).
 * EC-2: generowanie sekcji epikryzy na podstawie danych z aplikacji (patientData)
 *        i odpowiedzi z ankiety (surveyAnswers).
 * EC-3: szablony wniosków per profil diagnostyczny (GHD, KOWD, ISS, SGA, Turner,
 *        niedoczynność tarczycy).
 * EC-4: publiczne API: VildaEpicrisis.generate(patientData, surveyAnswers).
 *
 * UWAGA: moduł jest czysto logiczny — nie dotyka DOM, nie zna formularzy.
 * Dane wejściowe i wyjściowe są opisane w JSDoc poniżej.
 * ========================================================================== */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.VildaEpicrisis = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ── EC-1: POMOCNIKI ──────────────────────────────────────────────────── */

  function round1(v) {
    return v != null ? Math.round(parseFloat(v) * 10) / 10 : null;
  }

  function round2(v) {
    return v != null ? Math.round(parseFloat(v) * 100) / 100 : null;
  }

  /** Formatuje liczbę do 1 miejsca po przecinku z polskim separatorem. */
  function fmt1(v) {
    if (v == null) return null;
    return round1(v).toFixed(1).replace('.', ',');
  }

  /** Formatuje liczbę do 2 miejsc po przecinku z polskim separatorem. */
  function fmt2(v) {
    if (v == null) return null;
    return round2(v).toFixed(2).replace('.', ',');
  }

  /**
   * Formatuje liczbę do prezentacji: 1 miejsce po przecinku, separator PL,
   * bez zbędnego „,0" (np. 173,5 → "173,5"; 26 → "26"). Do wartości
   * wyświetlanych w tekście (zastępuje round1, które zwracało liczbę z kropką).
   */
  function fmtN(v) {
    if (v == null || isNaN(parseFloat(v))) return null;
    return (Math.round(parseFloat(v) * 10) / 10).toFixed(1).replace('.', ',').replace(/,0$/, '');
  }

  /**
   * Formatuje wiek jako tekst polski, np. "12 lat i 5 miesięcy".
   * @param {number} ageYears - pełne lata
   * @param {number} [ageMonths=0] - dodatkowe miesiące (0-11)
   */
  function formatAge(ageYears, ageMonths) {
    const y = Math.floor(ageYears || 0);
    const m = Math.round(ageMonths || 0);
    const yStr = y + ' ' + pluralYears(y);
    if (m === 0) return yStr;
    return yStr + ' i ' + m + ' ' + pluralMonths(m);
  }

  function pluralYears(n) {
    if (n === 1) return 'rok';
    if (n >= 2 && n <= 4) return 'lata';
    return 'lat';
  }

  function pluralMonths(n) {
    if (n === 1) return 'miesiąc';
    if (n >= 2 && n <= 4) return 'miesiące';
    return 'miesięcy';
  }

  /**
   * Zwraca etykietę Z-score, np. "Z‑score = −2,79".
   * @param {number|null} sds
   */
  function sdsLabel(sds) {
    if (sds == null || isNaN(parseFloat(sds))) return null;
    const v = parseFloat(sds);
    const formatted = Math.abs(v).toFixed(2).replace('.', ',');
    return 'Z‑score = ' + (v < 0 ? '−' : '+') + formatted;
  }

  /**
   * Zwraca etykietę centyla, np. "81. centyla", "<1. centyla".
   * @param {number|null} c
   */
  function centileLabel(c) {
    if (c == null || isNaN(parseFloat(c))) return null;
    const n = parseFloat(c);
    if (n < 1)  return '<1. centyla';
    if (n > 99) return '>99. centyla';
    return Math.round(n) + '. centyla';
  }

  /**
   * Ocenia wynik testu stymulacyjnego GH i zwraca pełne zdanie.
   * Próg NFZ: szczyt GH ≥ 10 ng/mL = prawidłowe.
   * @param {number|string} peakGh
   */
  function ghResultLabel(peakGh) {
    const v = parseFloat(peakGh);
    if (isNaN(v)) return null;
    const valStr = round1(v).toString().replace('.', ',') + ' ng/mL';
    if (v >= 10)  return 'prawidłowe wydzielanie GH (szczyt ' + valStr + ')';
    if (v >=  5)  return 'niedobór częściowy GH (szczyt ' + valStr + ', poniżej normy 10 ng/mL)';
    return 'niedobór GH (szczyt ' + valStr + ', poniżej normy 10 ng/mL)';
  }

  /**
   * Zwraca przymiotnikową nazwę testu stymulacyjnego.
   * @param {string} type - klucz: 'clonidine' | 'glucagon' | 'insulin' | 'ldopa' | 'arginine' | 'ghrh' | 'other'
   */
  function testName(type) {
    const map = {
      clonidine: 'klonidynowy',
      glucagon:  'glukagonowy',
      insulin:   'insulinowy',
      ldopa:     'L‑DOPA',
      arginine:  'argininowy',
      ghrh:      'GHRH',
      other:     'stymulacyjny',
    };
    return map[type] || 'stymulacyjny';
  }

  /**
   * Zwraca narzędnikową formę nazwy substancji stymulującej (do zdania "test z ...").
   * @param {string} type - klucz jak w testName
   */
  function testNameInstrumental(type) {
    const map = {
      clonidine: 'klonidyną',
      glucagon:  'glukagonem',
      insulin:   'insuliną',
      ldopa:     'L‑DOPĄ',
      arginine:  'argininą',
      ghrh:      'GHRH',
      other:     'substancją stymulującą',
    };
    return map[type] || 'substancją stymulującą';
  }

  /**
   * Zwraca ocenę kliniczną wydzielania GH na podstawie szczytu (ng/mL).
   * @param {number|string} peakGh
   */
  function ghNormalityLabel(peakGh) {
    const v = parseFloat(peakGh);
    if (isNaN(v)) return 'wydzielanie hormonu wzrostu do oceny';
    if (v >= 10) return 'prawidłowe wydzielanie hormonu wzrostu';
    if (v >=  5) return 'częściowy niedobór hormonu wzrostu';
    return 'niedobór hormonu wzrostu';
  }

  /**
   * Tworzy odmienne formy gramatyczne dla płci.
   * @param {'M'|'F'} s
   */
  function sexForms(s) {
    return s === 'M'
      ? { mianownik: 'chłopiec', dopelniacz: 'chłopca', biernik: 'chłopca',
          przyimek: 'u chłopca', czasownik: 'został', przyrostek: 'y' }
      : { mianownik: 'dziewczynka', dopelniacz: 'dziewczynki', biernik: 'dziewczynkę',
          przyimek: 'u dziewczynki', czasownik: 'została', przyrostek: 'a' };
  }

  /** Pierwsza litera wielka. */
  function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /** Zaokrągla do 0,5 (np. 1,9 → 2,0; 2,2 → 2,0; 2,5 → 2,5). */
  function roundHalf(v) {
    return Math.round(v * 2) / 2;
  }

  /**
   * Formatuje opóźnienie/przyspieszenie wieku kostnego (zaokrąglone do 0,5 roku)
   * z poprawną polską odmianą, np. "2 lata", "1,5 roku", "3 lat".
   * @param {number} d - wartość bezwzględna opóźnienia
   */
  function fmtBoneAgeDelay(d) {
    const r = roundHalf(Math.abs(d));
    if (r === Math.floor(r)) {
      const n = Math.floor(r);
      return String(n) + ' ' + pluralYears(n);
    }
    return r.toFixed(1).replace('.', ',') + ' roku';
  }

  /**
   * Łączy listę powodów hospitalizacji w naturalne polskie zdanie.
   * @param {string[]} reasons
   */
  function joinReasons(reasons) {
    if (!reasons || !reasons.length) return 'oceny auksometrycznej';
    const lower = reasons.map(function (r) { return r.toLowerCase(); });
    if (lower.length === 1) return lower[0];
    return lower.slice(0, -1).join(', ') + ' oraz ' + lower[lower.length - 1];
  }

  /* ── EC-2: GENEROWANIE SEKCJI ─────────────────────────────────────────── */

  /**
   * Główna funkcja modułu. Zwraca { text, sections }.
   *
   * @param {Object} pd - patientData: dane obliczone przez aplikację
   *   {number}  pd.ageYears          - wiek w latach
   *   {number}  [pd.ageMonths]       - dodatkowe miesiące (0-11)
   *   {'M'|'F'} pd.sex               - płeć
   *   {number}  pd.height            - wzrost (cm)
   *   {number}  [pd.heightSds]       - hSDS (Z-score wzrostu)
   *   {number}  [pd.heightPercentile]- centyl wzrostu
   *   {number}  [pd.heightDeficitTo3rd] - niedobór wzrostu do 3. centyla (cm)
   *   {number}  [pd.heightExcessOver97th] - nadmiar wzrostu ponad 97. centyl (cm)
   *   {number}  [pd.weight]          - masa (kg)
   *   {number}  [pd.weightSds]       - Z-score masy
   *   {number}  [pd.weightPercentile]- centyl masy
   *   {number}  [pd.weightDeficitTo3rd]  - niedobór masy do 3. centyla (kg)
   *   {number}  [pd.weightExcessOver97th] - nadmiar masy ponad 97. centyl (kg)
   *   {number}  [pd.bmi]             - BMI
   *   {number}  [pd.bmiPercentile]   - centyl BMI (źródło: bmiPercentileChild, OLAF/WHO/Palczewska)
   *   {number}  [pd.bmiSds]          - Z-score BMI
   *   {number}  [pd.coleIndex]       - wskaźnik Cole'a (%)
   *   {number}  [pd.motherHeight]    - wzrost matki (cm)
   *   {number}  [pd.fatherHeight]    - wzrost ojca (cm)
   *   {number}  [pd.mph]             - mid-parental height (cm)
   *   {number}  [pd.mphSds]          - SDS MPH
   *   {number}  [pd.mphPercentile]   - centyl MPH
   *   {number}  [pd.hSdsMpSds]       - hSDS − mpSDS
   *   {number}  [pd.boneAge]         - wiek kostny (lata)
   *   {number}  [pd.boneAgeDelay]    - opóźnienie BA (lata, ujemne = przyspieszenie)
   *   {number}  [pd.growthVelocity]  - tempo wzrastania (cm/rok)
   *   {number}  [pd.growthVelocityMonths] - okres obserwacji (mies.)
   *   {boolean} [pd.growthVelocityLow]    - czy tempo poniżej normy
   *   {string}  [pd.testicularVolume]     - objętość jąder (chłopcy)
   *   {Object}  [pd.predictions]
   *     {Object} [pd.predictions.bp]  - { value, error }  Bayley-Pinneau
   *     {Object} [pd.predictions.rwt] - { value, error }  RWT
   *   {string}  [pd.kowdProfile]     - 'standard'|'possible'|'probable'|'out-of-scope'
   *
   * @param {Object} sa - surveyAnswers: odpowiedzi z ankiety
   *   {string[]} [sa.reasons]           - powody hospitalizacji (tablica stringów)
   *   {string}   [sa.familyDelayedPuberty] - 'yes'|'no'|'unknown'
   *   {Object}   [sa.birth]
   *     {number}   [sa.birth.gestationalWeeks]
   *     {number}   [sa.birth.birthWeightG]
   *     {number}   [sa.birth.birthLengthCm]
   *     {number}   [sa.birth.birthWeightSds]  - obliczone przez app (SGA moduł)
   *     {number}   [sa.birth.birthLengthSds]
   *     {string}   [sa.birth.catchUp]         - 'yes'|'no'|'unknown'
   *   {Object}   [sa.clinical]
   *     {string}   [sa.clinical.proportionality] - 'proportional'|'short_limbs'|'short_trunk'
   *     {string}   [sa.clinical.dysmorphic]       - 'yes'|'no'
   *     {number}   [sa.clinical.tannerBreasts]    - 1-5 (dziewczynki)
   *     {number}   [sa.clinical.tannerGenitalia]  - 1-5 (chłopcy)
   *     {number}   [sa.clinical.tannerPubic]      - 1-5
   *     {string}   [sa.clinical.chronicDisease]   - 'yes'|'no'
   *   {string}   [sa.boneAgeMethod]   - 'Greulich-Pyle'|'TW3'|'Thiemann-Nitz'|'inne'
   *   {Object}   [sa.labs]
   *     {number}   [sa.labs.igf1]            - IGF-1 (ng/mL)
   *     {string}   [sa.labs.igf1Status]      - 'far_below'|'below'|'within'|'above'|'far_above'
   *                                            (auto-ocena z przelicznika; bez SDS)
   *     {number}   [sa.labs.igf1RefLow]      - dolna granica normy (ng/mL)
   *     {number}   [sa.labs.igf1RefHigh]     - górna granica normy (ng/mL)
   *     {boolean}  [sa.labs.igf1TannerUsed]  - czy normę dobrano wg Tannera (vs wieku)
   *     {number}   [sa.labs.igfbp3]
   *     {string}   [sa.labs.thyroidNormal]   - 'yes'|'no'
   *     {number}   [sa.labs.tsh]
   *     {number}   [sa.labs.ft4]
   *     {string}   [sa.labs.cortisolNormal]  - 'yes'|'no'
   *     {number}   [sa.labs.cortisolMorning]
   *     {string}   [sa.labs.celiacNormal]    - 'yes'|'no'|'not_done'
   *     {string}   [sa.labs.cbcNormal]       - 'yes'|'no'
   *     {string}   [sa.labs.biochemNormal]   - 'yes'|'no'
   *   {Object}   [sa.ghTests]
   *     {string}   [sa.ghTests.performed]    - 'yes'|'no'
   *     {string}   [sa.ghTests.priming]      - 'yes'|'no'
   *     {Object}   [sa.ghTests.test1]        - { type, peakGh }
   *     {Object}   [sa.ghTests.test2]        - { type, peakGh }
   *   {Object}   [sa.mri]
   *     {string}   [sa.mri.performed]        - 'yes'|'no'
   *     {string}   [sa.mri.result]           - 'normal'|'hypoplasia'|'thin_stalk'|'ectopic'|'microadenoma'|'macroadenoma'|'other'
   *     {string}   [sa.mri.resultOther]      - opis gdy result === 'other'
   *   {Object}   [sa.genetics]
   *     {string}   [sa.genetics.karyotype]       - 'done'|'not_done'|'na'
   *     {string}   [sa.genetics.karyotypeResult]  - '46XX'|'46XY'|'45X'|'mosaic'|'other'
   *     {string}   [sa.genetics.shox]             - 'positive'|'negative'|'not_done'
   *   {Object}   [sa.obesity]         - dane specyficzne dla profilu otyłości
   *     {string}   [sa.obesity.bpNormal]        - 'yes'|'no'
   *     {number}   [sa.obesity.bpSystolic]       - ciśnienie skurczowe (mmHg)
   *     {number}   [sa.obesity.bpDiastolic]      - ciśnienie rozkurczowe (mmHg)
   *     {string}   [sa.obesity.lipidsNormal]     - 'yes'|'no'|'not_done'
   *     {number}   [sa.obesity.cholTotal]        - cholesterol całkowity (mmol/L)
   *     {number}   [sa.obesity.ldl]              - LDL (mmol/L)
   *     {number}   [sa.obesity.hdl]              - HDL (mmol/L)
   *     {number}   [sa.obesity.triglycerides]    - trójglicerydy (mmol/L)
   *     {string}   [sa.obesity.homaIrElevated]   - 'yes'|'no'
   *     {number}   [sa.obesity.homaIr]           - wartość HOMA-IR
   *     {number}   [sa.obesity.insulin]          - insulina na czczo (μIU/mL)
   *     {string}   [sa.obesity.altElevated]      - 'yes'|'no'
   *     {number}   [sa.obesity.alt]              - ALT (U/L)
   *     {string}   [sa.obesity.thyroidNormal]    - 'yes'|'no' (TSH)
   *     {number}   [sa.obesity.tsh]              - TSH (mU/L)
   *   {string}   [sa.diagnosis]      - 'ghd'|'kowd'|'iss'|'sga'|'turner'|'thyroid'|'obesity'|'other'
   *
   * @returns {{ text: string, sections: string[] }}
   */

  /* Nazwy chorób przewlekłych w BIERNIKU (po „rozpoznano …"). */
  const CHRONIC_DISEASE_ACC = {
    astma:     'astmę oskrzelową',
    azs:       'atopowe zapalenie skóry',
    celiakia:  'celiakię',
    cukrzyca1: 'cukrzycę typu 1',
    tarczyca:  'chorobę tarczycy (Hashimoto / niedoczynność)',
    nzj:       'nieswoiste zapalenie jelit',
    pchn:      'przewlekłą chorobę nerek',
    padaczka:  'padaczkę',
    wadaserca: 'wrodzoną wadę serca',
  };

  function allergyNameAcc(subtype) {
    const map = { wziewna: 'alergię wziewną', pokarmowa: 'alergię pokarmową', mieszana: 'alergię mieszaną' };
    return map[subtype] || 'alergię';
  }

  /** Łączy listę naturalnie po polsku: „a, b oraz c". */
  function joinAnd(arr) {
    if (!arr || !arr.length) return '';
    if (arr.length === 1) return arr[0];
    return arr.slice(0, -1).join(', ') + ' oraz ' + arr[arr.length - 1];
  }

  /**
   * Sekcja „Wywiad chorobowy" — choroby przewlekłe z checklisty ankiety.
   * @param {Object} clinical - sa.clinical { chronicDisease, chronicDiseases[], allergySubtype, chronicOther }
   * @param {'M'|'F'} sex
   * @returns {string|null}
   */
  function buildDiseaseHistory(clinical, sex) {
    const c = clinical || {};
    if (c.chronicDisease === 'no') {
      return 'W wywiadzie chorobowym nie stwierdzono istotnych chorób przewlekłych.';
    }
    if (c.chronicDisease !== 'yes') return null;

    const sf = sexForms(sex);
    const list = [];
    const ids = Array.isArray(c.chronicDiseases) ? c.chronicDiseases : [];
    ids.forEach(function (id) {
      if (id === 'alergia') list.push(allergyNameAcc(c.allergySubtype));
      else if (CHRONIC_DISEASE_ACC[id]) list.push(CHRONIC_DISEASE_ACC[id]);
    });
    const other = (typeof c.chronicOther === 'string') ? c.chronicOther.trim() : '';

    if (list.length) {
      let t = 'U ' + sf.dopelniacz + ' rozpoznano ' + joinAnd(list) + '.';
      if (other) t += ' W wywiadzie ponadto: ' + other + '.';
      return t;
    }
    if (other) return 'W wywiadzie chorobowym: ' + other + '.';
    return 'W wywiadzie chorobowym stwierdzono chorobę przewlekłą.';
  }

  function generate(pd, sa) {
    if (!pd || !sa) throw new Error('VildaEpicrisis.generate: brak wymaganych argumentów');

    const s   = sexForms(pd.sex);
    const sections = [];
    /* Sekcje budowane do nazwanych zmiennych i składane w ustalonej kolejności
       na końcu (tablica `order`) — pozwala przenieść „Wywiad chorobowy" na
       początek i prognozę wzrostu za badania laboratoryjne bez zmiany logiki
       poszczególnych bloków. */
    let secIntro = null, secDisease = null, secFamily = null, secBirth = null,
        secExam = null, secGrowth = null, secPred = null, secLabs = null,
        secGh = null, secMri = null, secGen = null, secObesity = null, secConclusion = null;

    /* ── 1. Wprowadzenie (powód przyjęcia) ───────────────────────────────── */
    const ageStr  = formatAge(pd.ageYears, pd.ageMonths);
    const reasons = Array.isArray(sa.reasons) && sa.reasons.length
      ? joinReasons(sa.reasons)
      : 'oceny auksometrycznej';
    secIntro =
      capitalize(s.mianownik) + ' w wieku ' + ageStr + ' ' + s.czasownik +
      ' przyjęt' + s.przyrostek + ' do szpitala w celu ' + reasons + '.';

    /* ── 2. Wywiad chorobowy (choroby przewlekłe) ───────────────────────── */
    secDisease = buildDiseaseHistory(sa.clinical || {}, pd.sex);

    /* ── 3. Wywiad rodzicielski ──────────────────────────────────────────── */
    const hasMph = pd.motherHeight != null && pd.fatherHeight != null && pd.mph != null;
    if (hasMph) {
      let fp = 'Wywiad rodzinny: wzrost matki ' + Math.round(pd.motherHeight) + ' cm, wzrost ojca ' +
        Math.round(pd.fatherHeight) + ' cm.';
      fp += ' Wzrost docelowy (mid-parental height, MPH) wynosi ' + fmtN(pd.mph) + ' cm';
      const cL = centileLabel(pd.mphPercentile);
      const sL = sdsLabel(pd.mphSds);
      if (cL || sL) fp += ' (' + [cL, sL].filter(Boolean).join(', ') + ')';
      fp += '.';
      if (sa.familyDelayedPuberty === 'yes' && pd.sex === 'M') {
        fp += ' W wywiadzie rodzinnym stwierdzono konstytucjonalne opóźnienie wzrastania i dojrzewania.';
      } else if (sa.familyDelayedPuberty === 'no') {
        fp += ' Wywiad w kierunku konstytucjonalnego opóźnienia wzrastania i dojrzewania jest negatywny.';
      }
      secFamily = fp;
    }

    /* ── 4. Wywiad okołoporodowy ─────────────────────────────────────────── */
    const birth = sa.birth || {};
    const hasBirthData = birth.birthWeightG != null || birth.birthLengthCm != null;
    if (hasBirthData) {
      let bp = 'Wywiad okołoporodowy: dziecko urodzone';
      if (birth.gestationalWeeks) {
        bp += (birth.gestationalDays)
          ? ' w ' + birth.gestationalWeeks + '+' + birth.gestationalDays + ' tygodniu ciąży'
          : ' w ' + birth.gestationalWeeks + '. tygodniu ciąży';
      }
      /* Etykieta źródła norm SDS (Niklasson / INTERGROWTH-21st / Malewski) —
         dołączana raz, przy pierwszym prezentowanym SDS. */
      const srcSuffix = birth.sdsSourceLabel ? ' wg ' + birth.sdsSourceLabel : '';
      let srcShown = false;
      const bParts = [];
      if (birth.birthWeightG) {
        let wStr = 'masa urodzeniowa ' + birth.birthWeightG + ' g';
        if (birth.birthWeightSds != null) {
          wStr += ' (' + sdsLabel(birth.birthWeightSds) + (srcShown ? '' : srcSuffix) + ')';
          srcShown = true;
        }
        bParts.push(wStr);
      }
      if (birth.birthLengthCm) {
        let lStr = 'długość ' + birth.birthLengthCm + ' cm';
        if (birth.birthLengthSds != null) {
          lStr += ' (' + sdsLabel(birth.birthLengthSds) + (srcShown ? '' : srcSuffix) + ')';
          srcShown = true;
        }
        bParts.push(lStr);
      }
      if (bParts.length) bp += ', ' + bParts.join(', ');
      bp += '.';
      const isSga = (birth.birthWeightSds != null && birth.birthWeightSds < -2) ||
                    (birth.birthLengthSds  != null && birth.birthLengthSds  < -2);
      if (isSga) {
        bp += ' Noworodek mały w stosunku do wieku ciążowego (SGA).';
        if (birth.catchUp === 'yes') {
          bp += ' Nadgonienie wzrostu do 4. roku życia potwierdzone.';
        } else if (birth.catchUp === 'no') {
          bp += ' Brak nadgonienia wzrostu do 4. roku życia — spełnione kryterium SGA bez catch-up.';
        }
      }
      secBirth = bp;
    }

    /* ── 6. Badanie przedmiotowe (stan kliniczny) ───────────────────────── */
    const clinical = sa.clinical || {};
    const measureParts = [];

    const hSds  = sdsLabel(pd.heightSds);
    let hStr = 'wzrost ' + fmtN(pd.height) + ' cm';
    const hParens = [];
    if (pd.heightDeficitTo3rd != null && pd.heightDeficitTo3rd > 0) {
      hParens.push(fmt1(pd.heightDeficitTo3rd) + ' cm poniżej 3. centyla');
    } else if (pd.heightExcessOver97th != null && pd.heightExcessOver97th > 0) {
      hParens.push(fmt1(pd.heightExcessOver97th) + ' cm ponad 97. centyl');
    } else {
      const hCent = centileLabel(pd.heightPercentile);
      if (hCent) hParens.push(hCent);
    }
    if (hSds) hParens.push(hSds);
    if (hParens.length) hStr += ' (' + hParens.join(', ') + ')';
    measureParts.push(hStr);

    if (pd.weight != null) {
      let wStr = 'masa ciała ' + fmtN(pd.weight) + ' kg';
      const wParens = [];
      if (pd.weightDeficitTo3rd != null && pd.weightDeficitTo3rd > 0) {
        wParens.push(fmt1(pd.weightDeficitTo3rd) + ' kg poniżej 3. centyla');
      } else if (pd.weightExcessOver97th != null && pd.weightExcessOver97th > 0) {
        wParens.push(fmt1(pd.weightExcessOver97th) + ' kg ponad 97. centyl');
      } else {
        const wCent = centileLabel(pd.weightPercentile);
        if (wCent) wParens.push(wCent);
      }
      if (wParens.length) wStr += ' (' + wParens.join(', ') + ')';
      measureParts.push(wStr);
    }

    if (pd.bmi != null) {
      let bmiStr = 'BMI ' + fmt1(pd.bmi);
      const bCent = centileLabel(pd.bmiPercentile);
      if (bCent) bmiStr += ' (' + bCent + ')';
      measureParts.push(bmiStr);
      /* Wskaźnik Cole'a — zawsze bezpośrednio po wyniku BMI. */
      if (pd.coleIndex != null) {
        measureParts.push('wskaźnik Cole\'a ' + fmtN(pd.coleIndex) + '%');
      }
    }

    const examSentences = [];
    if (measureParts.length) {
      examSentences.push('W badaniu przedmiotowym przy przyjęciu: ' + measureParts.join(', ') + '.');
    }

    if (clinical.proportionality === 'proportional') {
      examSentences.push('Budowa ciała proporcjonalna.');
    } else if (clinical.proportionality === 'short_limbs') {
      examSentences.push('Stwierdzono niskorosłość nieproporcjonalną ze skróceniem kończyn.');
    } else if (clinical.proportionality === 'short_trunk') {
      examSentences.push('Stwierdzono niskorosłość nieproporcjonalną ze skróceniem tułowia.');
    }

    if (clinical.dysmorphic === 'yes') {
      examSentences.push('Stwierdzono cechy dysmorficzne.');
    } else if (clinical.dysmorphic === 'no') {
      examSentences.push('Bez widocznych cech dysmorficznych.');
    }

    /* Choroby przewlekłe przeniesiono do sekcji „Wywiad chorobowy" (sekcja 2). */

    const tannerParts = [];
    if (pd.sex === 'F' && clinical.tannerBreasts) {
      tannerParts.push('B' + clinical.tannerBreasts);
    }
    if (pd.sex === 'M' && clinical.tannerGenitalia) {
      tannerParts.push('G' + clinical.tannerGenitalia);
      if (pd.testicularVolume && pd.testicularVolume !== 'unknown') {
        tannerParts.push('obj. jąder ' + pd.testicularVolume);
      }
    }
    if (clinical.tannerPubic) {
      tannerParts.push('P' + clinical.tannerPubic);
    }
    if (tannerParts.length) {
      examSentences.push('Stopień dojrzewania wg Tannera: ' + tannerParts.join(', ') + '.');
    }

    if (examSentences.length) {
      secExam = examSentences.join(' ');
    }

    /* ── 5. Ocena wzrastania (osobne zdania, nie wyliczenie ze średnikami) ─ */
    const growthSentences = [];

    if (hasMph && pd.hSdsMpSds != null) {
      const gap = round2(pd.hSdsMpSds);
      const gapStr = (gap >= 0 ? '+' : '−') + Math.abs(gap).toFixed(2).replace('.', ',');
      let geneticPotential;
      if (gap < -2.0) {
        geneticPotential = 'rośnie poniżej swojego potencjału genetycznego';
      } else if (gap < -1.5) {
        geneticPotential = 'rośnie na granicy swojego potencjału genetycznego';
      } else if (gap > 0.5) {
        geneticPotential = 'przewyższa wzrost docelowy';
      } else {
        geneticPotential = 'rośnie w granicach swojego potencjału genetycznego';
      }
      growthSentences.push(capitalize(s.mianownik) + ' ' + geneticPotential + ' (hSDS − mpSDS = ' + gapStr + ').');
    }

    if (pd.boneAge != null) {
      const baMethod = sa.boneAgeMethod ? ' (metoda ' + sa.boneAgeMethod + ')' : '';
      let baStr = 'Wiek kostny oceniono na ' + fmtN(pd.boneAge) + ' lat' + baMethod;
      if (pd.boneAgeDelay != null) {
        const d = round1(pd.boneAgeDelay);
        if (d > 0.5) {
          baStr += ' i jest opóźniony o ' + fmtBoneAgeDelay(d) + ' w stosunku do wieku metrykalnego';
        } else if (d < -0.5) {
          baStr += ' i jest przyspieszony o ' + fmtBoneAgeDelay(d) + ' w stosunku do wieku metrykalnego';
        } else {
          baStr += ' i jest zgodny z wiekiem metrykalnym';
        }
      }
      growthSentences.push(baStr + '.');
    }

    if (pd.growthVelocity != null) {
      let gvStr = 'Aktualne tempo wzrastania wynosi ' + fmt1(pd.growthVelocity) + ' cm/rok';
      if (pd.growthVelocityMonths) gvStr += ' (z ' + pd.growthVelocityMonths + '-miesięcznej obserwacji)';
      gvStr += ' i jest ' + (pd.growthVelocityLow ? 'poniżej normy' : 'w normie') + ' dla wieku';
      growthSentences.push(gvStr + '.');
    }

    if (growthSentences.length) {
      secGrowth = growthSentences.join(' ');
    }

    /* ── 8. Prognoza wzrostu ostatecznego (składana po laboratorium) ────── */
    const bp  = pd.predictions && pd.predictions.bp;
    const rwt = pd.predictions && pd.predictions.rwt;
    if ((bp && bp.value != null) || (rwt && rwt.value != null)) {
      const bpStr  = bp  && bp.value  != null ? fmt1(bp.value)  + ' cm' + (bp.error  ? ' (±' + fmt1(bp.error)  + ' cm)' : '') : null;
      const rwtStr = rwt && rwt.value != null ? fmt1(rwt.value) + ' cm' + (rwt.error ? ' (±' + fmt1(rwt.error) + ' cm)' : '') : null;
      let predText = 'Na podstawie zgromadzonych informacji prognozowany wzrost ostateczny ';
      if (bpStr && rwtStr) {
        predText += 'metodą Bayley‑Pinneau wynosi ' + bpStr + ', a metodą RWT (Roche-Wainer-Thissen) ' + rwtStr + '.';
      } else if (bpStr) {
        predText += 'metodą Bayley‑Pinneau wynosi ' + bpStr + '.';
      } else {
        predText += 'metodą RWT (Roche-Wainer-Thissen) wynosi ' + rwtStr + '.';
      }
      secPred = predText;
    }

    /* ── 7. Badania laboratoryjne ────────────────────────────────────────── */
    const labs = sa.labs || {};
    const labParts = [];

    if (labs.igf1 != null) {
      let igfStr = 'IGF‑1 ' + fmtN(labs.igf1) + ' ng/mL';
      /* Auto-ocena względem zakresu referencyjnego dla wieku/stadium Tannera
         (przelicznik jednostek laboratoryjnych). Brak SDS — klasyfikacja
         interwałowa; sformułowania ostrożne klinicznie. */
      /* Tu ograniczamy się do INTERPRETACJI wyniku IGF-1 (poniżej / w zakresie /
         powyżej normy dla wieku lub stadium Tannera). Powiązanie niskiego IGF-1
         z wynikiem testu stymulacyjnego pada w podsumowaniu (buildConclusionGhd). */
      const st = labs.igf1Status;
      if (st && st !== 'no_interpretation' && st !== 'no_range') {
        const basis = labs.igf1TannerUsed ? 'dla stadium Tannera' : 'dla wieku';
        const refTxt = (labs.igf1RefLow != null && labs.igf1RefHigh != null)
          ? ' (norma ' + labs.igf1RefLow + '–' + labs.igf1RefHigh + ' ng/mL ' + basis + ')'
          : '';
        if (st === 'far_below' || st === 'below') {
          igfStr += ' — ' + (st === 'far_below' ? 'znacznie ' : '') + 'poniżej zakresu referencyjnego' + refTxt;
        } else if (st === 'far_above' || st === 'above') {
          igfStr += ' — ' + (st === 'far_above' ? 'znacznie ' : '') + 'powyżej zakresu referencyjnego' + refTxt;
        } else {
          igfStr += ' — w zakresie referencyjnym' + refTxt;
        }
      }
      labParts.push(igfStr);
    }
    if (labs.igfbp3 != null) {
      labParts.push('IGFBP‑3 ' + fmtN(labs.igfbp3) + ' mg/L');
    }
    if (labs.thyroidNormal === 'yes') {
      labParts.push('czynność tarczycy prawidłowa');
    } else if (labs.thyroidNormal === 'no') {
      let thStr = 'zaburzenia czynności tarczycy';
      if (labs.tsh  != null) thStr += ', TSH '  + labs.tsh;
      if (labs.ft4  != null) thStr += ', fT4 '  + labs.ft4;
      labParts.push(thStr);
    }
    if (labs.cortisolNormal === 'yes') {
      labParts.push('poranne stężenie kortyzolu w granicach normy');
    } else if (labs.cortisolNormal === 'no') {
      let cStr = 'poranne stężenie kortyzolu obniżone';
      if (labs.cortisolMorning != null) cStr += ' (' + labs.cortisolMorning + ' nmol/L)';
      labParts.push(cStr);
    }
    if (labs.celiacNormal === 'no') {
      labParts.push('podwyższone przeciwciała anty‑tTG IgA — podejrzenie celiakii');
    } else if (labs.celiacNormal === 'not_done') {
      labParts.push('badania w kierunku celiakii nie wykonano');
    }
    if (labs.cbcNormal === 'no') {
      labParts.push('odchylenia w morfologii krwi');
    }
    if (labs.biochemNormal === 'no') {
      labParts.push('odchylenia w biochemii krwi');
    }
    if (labParts.length) {
      secLabs = 'W badaniach laboratoryjnych przeprowadzonych w szpitalu: ' + labParts.join('; ') + '.';
    }

    /* ── Testy stymulacyjne GH (składane w bloku laboratoryjnym) ────────── */
    const ghSectionText = buildGhSection(sa.ghTests, sa.diagnosis);
    if (ghSectionText) secGh = ghSectionText;

    /* ── 9. MRI przysadki ───────────────────────────────────────────────── */
    const mri = sa.mri || {};
    if (mri.performed === 'yes') {
      const mriMap = {
        normal:       'obraz prawidłowy, bez ogniskowych zmian',
        hypoplasia:   'hipoplazja przysadki',
        thin_stalk:   'cienki lejek przysadki',
        ectopic:      'ektopia tylnego płata przysadki',
        microadenoma: 'mikrogruczolak przysadki',
        macroadenoma: 'makrogruczolak przysadki',
        other:        mri.resultOther || 'wynik niestandardowy — wymaga opisu',
      };
      secMri =
        'Badanie MRI okolicy podwzgórzowo‑przysadkowej: ' +
        (mriMap[mri.result] || (mri.result || 'wynik do uzupełnienia')) + '.';
    }

    /* ── 10. Badania genetyczne ─────────────────────────────────────────── */
    const gen = sa.genetics || {};
    const genParts = [];
    if (gen.karyotype === 'done' && gen.karyotypeResult) {
      const kMap = {
        '46XX':  'kariotyp 46,XX — prawidłowy żeński',
        '46XY':  'kariotyp 46,XY — prawidłowy męski',
        '45X':   'kariotyp 45,X — zespół Turnera',
        'mosaic':'kariotyp — mozaicyzm (wynik wymaga opisu)',
        'other': 'kariotyp — wynik niestandardowy (wynik wymaga opisu)',
      };
      genParts.push(kMap[gen.karyotypeResult] || 'kariotyp: ' + gen.karyotypeResult);
    }
    if (gen.shox === 'positive') {
      genParts.push('mutacja/delecja genu SHOX potwierdzona');
    } else if (gen.shox === 'negative') {
      genParts.push('badanie w kierunku mutacji SHOX ujemne');
    }
    if (genParts.length) {
      secGen = 'Badania genetyczne: ' + genParts.join('; ') + '.';
    }

    /* ── 10b. Profil otyłości — powikłania metaboliczne ─────────────────── */
    const ob = sa.obesity || {};
    const isObesityProfile = sa.diagnosis === 'obesity';
    const hasObesityData = ob.bpNormal != null || ob.lipidsNormal != null ||
                           ob.homaIrElevated != null || ob.altElevated != null ||
                           ob.thyroidNormal != null;
    if (isObesityProfile || hasObesityData) {
      const obParts = [];

      if (ob.bpNormal === 'no') {
        let bpStr = 'podwyższone ciśnienie tętnicze';
        if (ob.bpSystolic && ob.bpDiastolic) {
          bpStr += ' (' + ob.bpSystolic + '/' + ob.bpDiastolic + ' mmHg)';
        }
        obParts.push(bpStr);
      } else if (ob.bpNormal === 'yes') {
        obParts.push('ciśnienie tętnicze prawidłowe');
      }

      if (ob.lipidsNormal === 'no') {
        const lipParts = [];
        if (ob.cholTotal)     lipParts.push('Chol ' + ob.cholTotal + ' mmol/L');
        if (ob.ldl)           lipParts.push('LDL ' + ob.ldl + ' mmol/L');
        if (ob.hdl)           lipParts.push('HDL ' + ob.hdl + ' mmol/L');
        if (ob.triglycerides) lipParts.push('TG ' + ob.triglycerides + ' mmol/L');
        obParts.push('zaburzenia lipidowe' + (lipParts.length ? ' (' + lipParts.join(', ') + ')' : ''));
      } else if (ob.lipidsNormal === 'yes') {
        obParts.push('lipidogram prawidłowy');
      }

      if (ob.homaIrElevated === 'yes') {
        let homaStr = 'insulinooporność';
        if (ob.homaIr  != null) homaStr += ' (HOMA‑IR ' + fmt1(ob.homaIr) + ')';
        if (ob.insulin != null) homaStr += ', insulina na czczo ' + fmt1(ob.insulin) + ' μIU/mL';
        obParts.push(homaStr);
      } else if (ob.homaIrElevated === 'no') {
        let homaStr = 'brak insulinooporności';
        if (ob.homaIr != null) homaStr += ' (HOMA‑IR ' + fmt1(ob.homaIr) + ')';
        obParts.push(homaStr);
      }

      if (ob.altElevated === 'yes') {
        let altStr = 'podwyższona aktywność ALT';
        if (ob.alt != null) altStr += ' (' + fmtN(ob.alt) + ' U/L)';
        obParts.push(altStr + ' — podejrzenie NAFLD');
      }

      if (ob.thyroidNormal === 'no') {
        let thyStr = 'zaburzenia czynności tarczycy';
        if (ob.tsh != null) thyStr += ' (TSH ' + ob.tsh + ' mU/L)';
        obParts.push(thyStr);
      }

      if (obParts.length) {
        secObesity = 'Metaboliczne powikłania otyłości: ' + obParts.join('; ') + '.';
      }
    }

    /* ── 11. Wniosek diagnostyczny ──────────────────────────────────────── */
    const conclusionBuilders = {
      ghd:     buildConclusionGhd,
      kowd:    buildConclusionKowd,
      iss:     buildConclusionIss,
      sga:     buildConclusionSga,
      turner:  buildConclusionTurner,
      thyroid: buildConclusionThyroid,
      obesity: buildConclusionObesity,
    };
    if (sa.diagnosis && conclusionBuilders[sa.diagnosis]) {
      secConclusion = conclusionBuilders[sa.diagnosis](pd, sa);
    }

    /* ── Złożenie tekstu w docelowej kolejności epikryzy niskorosłości ──── */
    const order = [
      secIntro,       // 1. Powód przyjęcia
      secDisease,     // 2. Wywiad chorobowy
      secFamily,      // 3. Wywiad rodzicielski
      secBirth,       // 4. Wywiad okołoporodowy
      secExam,        // 5. Badanie przedmiotowe
      secGrowth,      // 6. Ocena wzrastania
      secLabs,        // 7. Badania laboratoryjne …
      secGh,          //    … testy stymulacyjne GH
      secMri,         //    … MRI przysadki
      secGen,         //    … badania genetyczne
      secObesity,     //    … powikłania metaboliczne (profil otyłości)
      secPred,        // 8. Prognoza wzrostu ostatecznego
      secConclusion,  // 9. Podsumowanie
    ];
    order.forEach(function (x) { if (x) sections.push(x); });
    return { text: sections.join('\n\n'), sections: sections };
  }

  /* ── EC-2b: SEKCJA TESTÓW STYMULACYJNYCH GH (helper) ────────────────── */

  /**
   * Buduje tekst sekcji 8 na podstawie kontekstu i wyników testów.
   * @param {Object} ghTests - sa.ghTests
   * @returns {string|null}
   */
  function buildGhSection(ghTests, diagnosis) {
    if (!ghTests || ghTests.performed !== 'yes') return null;

    const context = ghTests.context || 'both';
    const t1 = ghTests.test1;
    const t2 = ghTests.test2;
    const p1 = t1 && t1.peakGh != null ? parseFloat(t1.peakGh) : null;
    const p2 = t2 && t2.peakGh != null ? parseFloat(t2.peakGh) : null;

    let text = '';

    if (context === 'first_only') {
      /* Tylko 1. test; 2. test potwierdzający planowany */
      if (p1 == null) return null;
      const v1 = fmt1(p1) + ' ng/mL';
      if (p1 >= 10) {
        text = 'W trakcie hospitalizacji przeprowadzono test stymulacji wydzielania hormonu wzrostu z ' +
          testNameInstrumental(t1.type) + ', w którym uzyskano szczytowe stężenie GH ' +
          v1 + ' (norma powyżej 10 ng/mL), co wskazuje na prawidłowe wydzielanie hormonu wzrostu u dziecka.';
      } else {
        text = 'W trakcie hospitalizacji przeprowadzono pierwszy test stymulacji wydzielania hormonu wzrostu z ' +
          testNameInstrumental(t1.type) + ', w którym uzyskano szczytowe stężenie GH ' +
          v1 + ' (norma powyżej 10 ng/mL). Wynik poniżej normy — konieczne jest uzupełnienie diagnostyki' +
          ' o drugi test stymulacyjny z innym preparatem.';
      }

    } else if (context === 'second_only') {
      /* 2. test potwierdzający wykonany w tej hospitalizacji;
         test1 = wynik 1. testu z poprzedniej hospitalizacji (opcjonalnie) */
      if (p2 == null) return null;
      const v2 = fmt1(p2) + ' ng/mL';
      if (p2 >= 10) {
        text = 'W trakcie bieżącej hospitalizacji przeprowadzono test stymulacji wydzielania hormonu wzrostu z ' +
          testNameInstrumental(t2.type) + ', w którym uzyskano szczytowe stężenie GH ' +
          v2 + ' (norma powyżej 10 ng/mL), co wskazuje na prawidłowe wydzielanie hormonu wzrostu u dziecka.';
        if (p1 != null) {
          text += ' W pierwszym teście stymulacyjnym (z ' + testNameInstrumental(t1.type) +
            ', wykonanym w poprzedniej hospitalizacji) uzyskano szczyt GH ' + fmt1(p1) + ' ng/mL.';
        }
      } else {
        if (p1 != null) {
          text = 'W ramach diagnostyki przeprowadzono dwa testy stymulacji wydzielania hormonu wzrostu:' +
            ' w poprzedniej hospitalizacji test z ' + testNameInstrumental(t1.type) +
            ' (szczyt GH ' + fmt1(p1) + ' ng/mL) oraz w trakcie bieżącej hospitalizacji test z ' +
            testNameInstrumental(t2.type) + ' (szczyt GH ' + v2 + ') — norma powyżej 10 ng/mL.' +
            ' Oba wyniki poniżej normy, co potwierdza niedobór hormonu wzrostu u dziecka.';
        } else {
          text = 'W trakcie bieżącej hospitalizacji przeprowadzono drugi (potwierdzający) test stymulacji' +
            ' wydzielania hormonu wzrostu z ' + testNameInstrumental(t2.type) +
            ', w którym uzyskano szczytowe stężenie GH ' + v2 +
            ' (norma powyżej 10 ng/mL). W połączeniu z wynikiem pierwszego testu stymulacyjnego,' +
            ' oba wyniki poniżej normy potwierdzają niedobór hormonu wzrostu u dziecka.';
        }
      }

    } else {
      /* context === 'both': oba testy wykonane w tej hospitalizacji (domyślne) */
      if (p1 != null && p2 != null) {
        const v1 = fmt1(p1) + ' ng/mL';
        const v2 = fmt1(p2) + ' ng/mL';
        const anyNormal = p1 >= 10 || p2 >= 10;
        text = 'W trakcie hospitalizacji przeprowadzono dwa testy stymulacji wydzielania hormonu wzrostu:' +
          ' z ' + testNameInstrumental(t1.type) + ', w którym uzyskano szczytowe stężenie GH ' + v1 + ',' +
          ' oraz z ' + testNameInstrumental(t2.type) + ', w którym uzyskano ' + v2 + ' (norma powyżej 10 ng/mL). ';
        if (anyNormal) {
          text += 'Uzyskanie szczytu GH powyżej 10 ng/mL w co najmniej jednym teście wskazuje na' +
            ' prawidłowe wydzielanie hormonu wzrostu u dziecka.';
        } else {
          text += 'Oba wyniki poniżej normy, co potwierdza niedobór hormonu wzrostu u dziecka.';
        }
      } else if (p1 != null) {
        /* Jeden test w kontekście 'both' (fallback) */
        text = 'W trakcie hospitalizacji przeprowadzono test stymulacji wydzielania hormonu wzrostu z ' +
          testNameInstrumental(t1.type) + ', w którym uzyskano szczytowe stężenie GH ' +
          fmt1(p1) + ' ng/mL (norma powyżej 10 ng/mL), co wskazuje na ' + ghNormalityLabel(p1) + ' u dziecka.';
      } else {
        return null;
      }
    }

    /* Doprecyzowanie dla ścieżki SGA — prawidłowe GH jest tu oczekiwane i nie
       zamyka drogi do leczenia; niedobór GH kieruje na ścieżkę B.19 (SNP). */
    if (text && diagnosis === 'sga') {
      const sgaPeaks = [p1, p2].filter(function (v) { return v != null && !isNaN(v); });
      if (sgaPeaks.length) {
        const anyNormal = sgaPeaks.some(function (v) { return v >= 10; });
        text += anyNormal
          ? ' W kontekście niskorosłości na tle SGA prawidłowe wydzielanie hormonu wzrostu jest wynikiem' +
            ' oczekiwanym i nie zamyka drogi do leczenia hormonem wzrostu.'
          : ' W kontekście niskorosłości na tle SGA niedobór hormonu wzrostu kieruje dalszą diagnostykę' +
            ' na ścieżkę somatotropinowej niedoczynności przysadki (B.19).';
      }
    }

    if (text && ghTests.priming === 'yes') text += ' Zastosowano priming estrogenowy.';
    return text || null;
  }

  /* ── EC-3: WNIOSKI PER PROFIL ─────────────────────────────────────────── */

  function buildConclusionGhd(pd, sa) {
    const gh = sa.ghTests || {};
    const sf = sexForms(pd.sex);
    const context = gh.context || 'both';
    const peak1 = gh.test1 && gh.test1.peakGh != null ? parseFloat(gh.test1.peakGh) : null;
    const peak2 = gh.test2 && gh.test2.peakGh != null ? parseFloat(gh.test2.peakGh) : null;

    /* Określ status wydzielania GH */
    let ghStatus; // 'confirmed' | 'pending' | 'normal' | 'unknown'
    if (context === 'first_only') {
      if (peak1 == null)    ghStatus = 'unknown';
      else if (peak1 >= 10) ghStatus = 'normal';
      else                  ghStatus = 'pending';
    } else if (context === 'second_only') {
      if (peak2 == null)    ghStatus = 'unknown';
      else if (peak2 >= 10) ghStatus = 'normal';
      else                  ghStatus = 'confirmed';
    } else {
      /* 'both' */
      const anyNormal = (peak1 != null && peak1 >= 10) || (peak2 != null && peak2 >= 10);
      const hasData   = peak1 != null || peak2 != null;
      if (!hasData)         ghStatus = 'unknown';
      else if (anyNormal)   ghStatus = 'normal';
      else                  ghStatus = 'confirmed';
    }

    let c = 'Na podstawie przeprowadzonej diagnostyki';
    if (ghStatus === 'confirmed') {
      if (context === 'both' && peak1 != null && peak2 != null) {
        c += ' rozpoznano niedobór hormonu wzrostu (szczyt GH poniżej 10 ng/mL w obydwu testach stymulacyjnych).';
      } else {
        c += ' obraz kliniczny i wyniki testów stymulacyjnych odpowiadają niedoborowi hormonu wzrostu.';
      }
    } else if (ghStatus === 'normal') {
      c += ' wykluczono niedobór hormonu wzrostu jako przyczynę niskiego wzrostu u dziecka.';
    } else if (ghStatus === 'pending') {
      c += ' wynik pierwszego testu stymulacyjnego (szczyt GH ' + fmt1(peak1) +
        ' ng/mL) jest poniżej normy i wymaga potwierdzenia w drugim teście.';
    } else {
      c += ' obraz kliniczny sugeruje niedobór hormonu wzrostu — wyniki wymagają weryfikacji.';
    }

    /* Powiązanie niskiego IGF-1 z wynikiem testu stymulacyjnego (przeniesione
       z sekcji laboratoryjnej, by interpretacja kliniczna padła w podsumowaniu). */
    const labsGhd = sa.labs || {};
    const igfLow = labsGhd.igf1Status === 'below' || labsGhd.igf1Status === 'far_below';
    if (igfLow && (ghStatus === 'confirmed' || ghStatus === 'pending')) {
      c += ' Niskie stężenie IGF‑1 w połączeniu ze szczytem hormonu wzrostu poniżej normy w teście stymulacyjnym wspiera rozpoznanie niedoboru hormonu wzrostu.';
    }

    if (ghStatus === 'pending') {
      c += ' ' + capitalize(sf.mianownik) + ' wymaga dalszej opieki endokrynologicznej' +
        ' z uwagi na konieczność przeprowadzenia drugiego testu stymulacyjnego.';
    } else {
      c += ' ' + capitalize(sf.mianownik) + ' wymaga dalszej opieki endokrynologicznej oraz okresowej oceny tempa wzrastania.' +
        ' Po wykonaniu wszystkich zaplanowanych badań dziecko w stanie ogólnym dobrym zwolniono do domu z zaleceniami jak niżej.';
    }
    return c;
  }

  function buildConclusionKowd(pd, sa) {
    const baDelay = pd.boneAgeDelay != null ? round1(pd.boneAgeDelay) : null;
    let c = 'Całość obrazu klinicznego';
    const features = [];
    if (baDelay != null && baDelay > 1) {
      features.push('opóźnienie wieku kostnego o ' + fmtBoneAgeDelay(baDelay));
    }
    if (sa.familyDelayedPuberty === 'yes') {
      features.push('dodatni wywiad rodzinny w kierunku KOWD');
    }
    if (features.length) c += ' (' + features.join(', ') + ')';
    c += ' przemawia za rozpoznaniem konstytucjonalnego opóźnienia wzrastania i dojrzewania (KOWD/CDGP).';
    const rwt = pd.predictions && pd.predictions.rwt;
    if (rwt && rwt.value != null) {
      c += ' Prognoza wzrostu ostatecznego jest zadowalająca (RWT: ' + fmt1(rwt.value) + ' cm).';
    }
    c += ' Wydzielanie hormonu wzrostu mieści się w granicach normy. Zalecana obserwacja auksometryczna za 6 miesięcy.';
    return c;
  }

  function buildConclusionIss(pd, sa) {
    let c = 'Po wykluczeniu organicznych przyczyn niskorosłości';
    if (sa.ghTests && sa.ghTests.performed === 'yes') {
      c += ' i potwierdzeniu prawidłowego wydzielania hormonu wzrostu';
    }
    c += ' rozpoznano niskorosłość idiopatyczną (ISS — idiopathic short stature).';
    if (pd.hSdsMpSds != null && pd.hSdsMpSds < -0.5) {
      c += ' Wzrost dziecka jest wyraźnie poniżej oczekiwanego potencjału genetycznego (hSDS − mpSDS = ' +
        round2(pd.hSdsMpSds).toFixed(2).replace('.', ',') + '), co wymaga dalszej obserwacji.';
    }
    return c;
  }

  function buildConclusionSga(pd, sa) {
    let c = 'Dziecko spełnia kryteria niskorosłości na tle urodzenia małego w stosunku do wieku ciążowego (SGA) bez nadgonienia wzrostu do 4. roku życia.';
    const bp  = pd.predictions && pd.predictions.bp;
    const rwt = pd.predictions && pd.predictions.rwt;
    if (rwt && rwt.value != null) {
      c += ' Prognoza wzrostu ostatecznego metodą RWT: ' + fmt1(rwt.value) + ' cm.';
    } else if (bp && bp.value != null) {
      c += ' Prognoza wzrostu ostatecznego metodą Bayley‑Pinneau: ' + fmt1(bp.value) + ' cm.';
    }

    /* Interpretacja testu stymulacyjnego GH w ścieżce SGA — ODWROTNIE niż w GHD:
       prawidłowe wydzielanie GH jest wymagane i NIE zamyka drogi do leczenia;
       niedobór GH przenosi dziecko do programu SNP (B.19), nie do programu SGA. */
    const gh = sa.ghTests || {};
    let ghDeficient = false;
    if (gh.performed === 'yes') {
      const p1 = gh.test1 && gh.test1.peakGh != null ? parseFloat(gh.test1.peakGh) : null;
      const p2 = gh.test2 && gh.test2.peakGh != null ? parseFloat(gh.test2.peakGh) : null;
      const peaks = [p1, p2].filter(function (v) { return v != null && !isNaN(v); });
      if (peaks.length) {
        const anyNormal = peaks.some(function (v) { return v >= 10; });
        if (anyNormal) {
          c += ' Prawidłowe wydzielanie hormonu wzrostu w teście stymulacyjnym jest zgodne z programem' +
            ' leczenia niskorosłych dzieci urodzonych jako zbyt małe w porównaniu do czasu trwania ciąży' +
            ' i nie stanowi przeciwwskazania do leczenia hormonem wzrostu.';
        } else {
          ghDeficient = true;
          c += ' Stwierdzony w testach stymulacyjnych niedobór hormonu wzrostu (szczyt poniżej 10 ng/mL)' +
            ' wskazuje na współistniejącą somatotropinową niedoczynność przysadki — kwalifikację należy' +
            ' prowadzić ścieżką programu leczenia somatotropinowej niedoczynności przysadki (B.19),' +
            ' a nie programu dla dzieci urodzonych jako zbyt małe w porównaniu do czasu trwania ciąży.';
        }
      }
    }

    if (!ghDeficient) {
      c += ' Wskazane rozważenie kwalifikacji do leczenia hormonem wzrostu w ramach programu lekowego B.64 NFZ.';
    }
    return c;
  }

  function buildConclusionTurner(pd, sa) {
    const gen = sa.genetics || {};
    let c;
    if (gen.karyotype === 'done' && gen.karyotypeResult === '45X') {
      c = 'Na podstawie badania kariotypu (45,X) rozpoznano zespół Turnera.';
    } else if (gen.karyotype === 'done' && gen.karyotypeResult === 'mosaic') {
      c = 'Na podstawie badania kariotypu rozpoznano mozaicyzm odpowiadający zespołowi Turnera.';
    } else {
      c = 'Obraz kliniczny sugeruje zespół Turnera — wymagana weryfikacja kariotypem.';
    }
    c += ' Wskazana kwalifikacja do leczenia hormonem wzrostu (program B.42 NFZ) oraz pilna konsultacja kardiologiczna i endokrynologiczna.';
    return c;
  }

  function buildConclusionThyroid(pd, sa) {
    return 'Stwierdzono niedoczynność tarczycy jako prawdopodobną przyczynę niskorosłości i zwolnionego tempa wzrastania.' +
      ' Wdrożenie substytucji L‑tyroksyną powinno umożliwić nadgonienie wzrostu —' +
      ' wskazana kontrola auksometryczna po 6 miesiącach wyrównanej czynności tarczycy.';
  }

  function buildConclusionObesity(pd, sa) {
    const ob = sa.obesity || {};
    let c = '';

    /* Klasyfikacja na podstawie wskaźnika Cole'a lub centyla BMI */
    if (pd.coleIndex != null) {
      const ci = Math.round(pd.coleIndex);
      if (ci >= 150) {
        c = 'Na podstawie wskaźnika Colea (' + ci + '%) rozpoznano otyłość olbrzymią.';
      } else if (ci >= 120) {
        c = 'Na podstawie wskaźnika Colea (' + ci + '%) rozpoznano otyłość prostą.';
      } else if (ci >= 110) {
        c = 'Na podstawie wskaźnika Colea (' + ci + '%) rozpoznano nadwagę.';
      } else {
        c = 'Wskaźnik Colea wynosi ' + ci + '%.';
      }
    } else if (pd.bmiPercentile != null) {
      const bCent = centileLabel(pd.bmiPercentile);
      if (pd.bmiPercentile >= 97) {
        c = 'Na podstawie centyla BMI (' + bCent + ') rozpoznano otyłość.';
      } else if (pd.bmiPercentile >= 90) {
        c = 'Na podstawie centyla BMI (' + bCent + ') rozpoznano nadwagę.';
      } else {
        c = 'BMI na ' + (bCent || String(Math.round(pd.bmiPercentile)) + '. centyla') + '.';
      }
    } else {
      c = 'Rozpoznano otyłość prostą.';
    }

    /* Powikłania metaboliczne */
    const comp = [];
    if (ob.homaIrElevated === 'yes')                           comp.push('insulinooporność');
    if (ob.lipidsNormal   === 'no')                            comp.push('dyslipidemia');
    if (ob.bpNormal       === 'no')                            comp.push('nadciśnienie tętnicze');
    if (ob.altElevated    === 'yes')                           comp.push('niealkoholowa stłuszczeniowa choroba wątroby (NAFLD)');
    if (ob.thyroidNormal  === 'no')                            comp.push('niedoczynność tarczycy');

    if (comp.length === 1) {
      c += ' Stwierdzono powikłanie metaboliczne: ' + comp[0] + '.';
    } else if (comp.length > 1) {
      c += ' Stwierdzono powikłania metaboliczne: ' + comp.join(', ') + '.';
    } else {
      c += ' Bez klinicznych cech powikłań metabolicznych.';
    }

    c += ' Zalecono intensywną modyfikację stylu życia (dieta + aktywność fizyczna) pod nadzorem wielodyscyplinarnego zespołu poradni leczenia otyłości.';

    /* Kryteria programu lekowego B.130 NFZ: wiek ≥ 12 lat + BMI ≥ 97. centyla */
    if (pd.ageYears >= 12 && pd.bmiPercentile != null && pd.bmiPercentile >= 97) {
      c += ' Wiek i wskaźniki antropometryczne mogą spełniać kryteria farmakoterapii otyłości (program lekowy B.130 NFZ) — kwalifikacja wymaga oceny w ośrodku specjalistycznym.';
    }

    return c;
  }

  /* ── EC-4: PUBLICZNE API ──────────────────────────────────────────────── */

  return {
    generate:  generate,
    /** Eksponowane tylko do testów jednostkowych */
    _helpers: {
      formatAge:            formatAge,
      sdsLabel:             sdsLabel,
      centileLabel:         centileLabel,
      ghResultLabel:        ghResultLabel,
      testName:             testName,
      testNameInstrumental: testNameInstrumental,
      ghNormalityLabel:     ghNormalityLabel,
      joinReasons:          joinReasons,
    },
    /** Eksponowane tylko do testów jednostkowych — funkcje sekcji */
    _sections: {
      buildGhSection: buildGhSection,
    },
  };
}));
