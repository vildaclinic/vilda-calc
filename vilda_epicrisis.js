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
   *   {number}  [pd.heightDeficitTo3rd] - niedobór do 3. centyla (cm), 0 gdy powyżej
   *   {number}  [pd.weight]          - masa (kg)
   *   {number}  [pd.bmi]             - BMI
   *   {number}  [pd.bmiPercentile]   - centyl BMI
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
   *     {number}   [sa.labs.igf1]
   *     {number}   [sa.labs.igf1Sds]
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
  function generate(pd, sa) {
    if (!pd || !sa) throw new Error('VildaEpicrisis.generate: brak wymaganych argumentów');

    const s   = sexForms(pd.sex);
    const sections = [];

    /* ── 1. Wprowadzenie ─────────────────────────────────────────────────── */
    const ageStr  = formatAge(pd.ageYears, pd.ageMonths);
    const reasons = Array.isArray(sa.reasons) && sa.reasons.length
      ? sa.reasons.join(', ').toLowerCase()
      : 'oceny auksometrycznej';
    sections.push(
      capitalize(s.mianownik) + ' w wieku ' + ageStr + ' ' + s.czasownik +
      ' przyjęt' + s.przyrostek + ' do szpitala w celu ' + reasons + '.'
    );

    /* ── 2. Wywiad rodzinny ──────────────────────────────────────────────── */
    const hasMph = pd.motherHeight != null && pd.fatherHeight != null && pd.mph != null;
    if (hasMph) {
      let fp = 'Wywiad rodzicielski: matka ' + Math.round(pd.motherHeight) + ' cm, ojciec ' +
        Math.round(pd.fatherHeight) + ' cm.';
      fp += ' Wzrost docelowy (mid-parental height, MPH) wynosi ' + round1(pd.mph) + ' cm';
      const cL = centileLabel(pd.mphPercentile);
      const sL = sdsLabel(pd.mphSds);
      if (cL || sL) fp += ' (' + [cL, sL].filter(Boolean).join(', ') + ')';
      fp += '.';
      if (sa.familyDelayedPuberty === 'yes' && pd.sex === 'M') {
        fp += ' W wywiadzie rodzinnym stwierdzono konstytucjonalne opóźnienie wzrastania i dojrzewania.';
      } else if (sa.familyDelayedPuberty === 'no') {
        fp += ' Wywiad rodzinny w kierunku konstytucjonalnego opóźnienia wzrastania i dojrzewania ujemny.';
      }
      sections.push(fp);
    }

    /* ── 3. Wywiad urodzeniowy ───────────────────────────────────────────── */
    const birth = sa.birth || {};
    const hasBirthData = birth.birthWeightG != null || birth.birthLengthCm != null;
    if (hasBirthData) {
      let bp = 'Dziecko urodzone';
      if (birth.gestationalWeeks) bp += ' w ' + birth.gestationalWeeks + '. tygodniu ciąży';
      const bParts = [];
      if (birth.birthWeightG) {
        let wStr = 'masa urodzeniowa ' + birth.birthWeightG + ' g';
        if (birth.birthWeightSds != null) wStr += ' (' + sdsLabel(birth.birthWeightSds) + ')';
        bParts.push(wStr);
      }
      if (birth.birthLengthCm) {
        let lStr = 'długość ' + birth.birthLengthCm + ' cm';
        if (birth.birthLengthSds != null) lStr += ' (' + sdsLabel(birth.birthLengthSds) + ')';
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
      sections.push(bp);
    }

    /* ── 4. Stan kliniczny ──────────────────────────────────────────────── */
    const clinical = sa.clinical || {};
    const clinParts = [];

    const hCent = centileLabel(pd.heightPercentile);
    const hSds  = sdsLabel(pd.heightSds);
    let hStr = 'wzrost ' + round1(pd.height) + ' cm';
    if (hCent || hSds) hStr += ' (' + [hCent, hSds].filter(Boolean).join(', ') + ')';
    if (pd.heightDeficitTo3rd != null && pd.heightDeficitTo3rd > 0) {
      hStr += ', niedobór ' + fmt1(pd.heightDeficitTo3rd) + ' cm do 3. centyla';
    }
    clinParts.push(hStr);

    if (pd.weight != null) {
      let wStr = 'masa ciała ' + round1(pd.weight) + ' kg';
      if (pd.bmi != null) {
        wStr += ', BMI ' + round1(pd.bmi);
        const bCent = centileLabel(pd.bmiPercentile);
        if (bCent) wStr += ' (' + bCent + ')';
      }
      clinParts.push(wStr);
    }

    if (clinical.proportionality === 'proportional') {
      clinParts.push('sylwetka proporcjonalna');
    } else if (clinical.proportionality === 'short_limbs') {
      clinParts.push('niskorosłość nieproporcjonalna — skrócenie kończyn');
    } else if (clinical.proportionality === 'short_trunk') {
      clinParts.push('niskorosłość nieproporcjonalna — skrócenie tułowia');
    }

    if (clinical.dysmorphic === 'yes') {
      clinParts.push('cechy dysmorficzne obecne');
    } else if (clinical.dysmorphic === 'no') {
      clinParts.push('bez widocznych cech dysmorficznych');
    }

    if (clinical.chronicDisease === 'yes') {
      clinParts.push('objawy sugerujące chorobę przewlekłą');
    }

    const tannerParts = [];
    if (pd.sex === 'F' && clinical.tannerBreasts) {
      tannerParts.push('piersi B' + clinical.tannerBreasts);
    }
    if (pd.sex === 'M' && clinical.tannerGenitalia) {
      tannerParts.push('genitalia G' + clinical.tannerGenitalia);
      if (pd.testicularVolume && pd.testicularVolume !== 'unknown') {
        tannerParts.push('obj. jąder ' + pd.testicularVolume);
      }
    }
    if (clinical.tannerPubic) {
      tannerParts.push('owłosienie łonowe P' + clinical.tannerPubic);
    }
    if (tannerParts.length) {
      clinParts.push('stopień dojrzewania wg Tannera: ' + tannerParts.join(', '));
    }

    if (clinParts.length) {
      sections.push('W badaniu przedmiotowym: ' + clinParts.join('; ') + '.');
    }

    /* ── 5. Ocena auksometryczna ────────────────────────────────────────── */
    const auxParts = [];

    if (hasMph && pd.hSdsMpSds != null) {
      const gap = round2(pd.hSdsMpSds);
      const absGap = Math.abs(gap);
      const gapStr = (gap >= 0 ? '+' : '−') + Math.abs(gap).toFixed(2).replace('.', ',');
      if (gap < -0.5) {
        auxParts.push('wzrost dziecka jest o ' + absGap.toFixed(2).replace('.', ',') +
          ' SDS poniżej wzrostu docelowego (hSDS − mpSDS = ' + gapStr + ')' +
          ' — wzrastanie poniżej potencjału genetycznego');
      } else if (gap > 0.5) {
        auxParts.push('wzrost dziecka przewyższa wzrost docelowy (hSDS − mpSDS = ' + gapStr + ')');
      } else {
        auxParts.push('wzrost dziecka zgodny z potencjałem genetycznym (hSDS − mpSDS = ' + gapStr + ')');
      }
    }

    if (pd.boneAge != null) {
      const baMethod = sa.boneAgeMethod ? ' (metoda ' + sa.boneAgeMethod + ')' : '';
      let baStr = 'wiek kostny ' + round1(pd.boneAge) + ' lat' + baMethod;
      if (pd.boneAgeDelay != null) {
        const d = round1(pd.boneAgeDelay);
        if (d > 0.5) {
          baStr += ', opóźniony o ' + fmt1(d) + ' ' + (d < 2 ? 'rok' : d < 5 ? 'lata' : 'lat');
        } else if (d < -0.5) {
          baStr += ', przyspieszony o ' + fmt1(Math.abs(d)) + ' lat';
        } else {
          baStr += ', zgodny z wiekiem metrycznym';
        }
      }
      auxParts.push(baStr);
    }

    if (pd.growthVelocity != null) {
      let gvStr = 'tempo wzrastania ' + round1(pd.growthVelocity) + ' cm/rok';
      if (pd.growthVelocityMonths) gvStr += ' (obliczone z ' + pd.growthVelocityMonths + ' mies.)';
      if (pd.growthVelocityLow) gvStr += ' — poniżej normy dla wieku';
      auxParts.push(gvStr);
    }

    if (pd.coleIndex != null) {
      auxParts.push('wskaźnik Cole\'a ' + round1(pd.coleIndex) + '%');
    }

    if (auxParts.length) {
      sections.push('Ocena auksometryczna: ' + auxParts.join('; ') + '.');
    }

    /* ── 6. Prognozy wzrostu ────────────────────────────────────────────── */
    const bp  = pd.predictions && pd.predictions.bp;
    const rwt = pd.predictions && pd.predictions.rwt;
    if ((bp && bp.value != null) || (rwt && rwt.value != null)) {
      const predParts = [];
      if (bp && bp.value != null) {
        predParts.push('metodą Bayley‑Pinneau ' + fmt1(bp.value) + ' cm' +
          (bp.error ? ' (±' + fmt1(bp.error) + ' cm)' : ''));
      }
      if (rwt && rwt.value != null) {
        predParts.push('metodą RWT ' + fmt1(rwt.value) + ' cm' +
          (rwt.error ? ' (±' + fmt1(rwt.error) + ' cm)' : ''));
      }
      sections.push('Prognoza wzrostu ostatecznego: ' + predParts.join('; ') + '.');
    }

    /* ── 7. Badania laboratoryjne ────────────────────────────────────────── */
    const labs = sa.labs || {};
    const labParts = [];

    if (labs.igf1 != null) {
      let igfStr = 'IGF‑1 ' + round1(labs.igf1) + ' ng/mL';
      if (labs.igf1Sds != null) igfStr += ' (' + sdsLabel(labs.igf1Sds) + ')';
      labParts.push(igfStr);
    }
    if (labs.igfbp3 != null) {
      labParts.push('IGFBP‑3 ' + round1(labs.igfbp3) + ' mg/L');
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
      labParts.push('kortyzol poranny w normie');
    } else if (labs.cortisolNormal === 'no') {
      let cStr = 'kortyzol poranny obniżony';
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
      sections.push('Wyniki badań laboratoryjnych: ' + labParts.join('; ') + '.');
    }

    /* ── 8. Testy stymulacyjne GH ───────────────────────────────────────── */
    const ghTests = sa.ghTests || {};
    if (ghTests.performed === 'yes') {
      const testParts = [];
      if (ghTests.test1 && ghTests.test1.peakGh != null) {
        const r = ghResultLabel(ghTests.test1.peakGh);
        if (r) testParts.push('test ' + testName(ghTests.test1.type) + ': ' + r);
      }
      if (ghTests.test2 && ghTests.test2.peakGh != null) {
        const r = ghResultLabel(ghTests.test2.peakGh);
        if (r) testParts.push('test ' + testName(ghTests.test2.type) + ': ' + r);
      }
      if (testParts.length) {
        let ghPart = 'Testy stymulacji wydzielania hormonu wzrostu: ' + testParts.join('; ') + '.';
        if (ghTests.priming === 'yes') ghPart += ' Zastosowano priming estrogenowy.';
        sections.push(ghPart);
      }
    } else if (ghTests.performed === 'no') {
      sections.push(
        'Testy stymulacji wydzielania hormonu wzrostu nie były wykonywane w trakcie bieżącej hospitalizacji.'
      );
    }

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
      sections.push(
        'Badanie MRI okolicy podwzgórzowo‑przysadkowej: ' +
        (mriMap[mri.result] || (mri.result || 'wynik do uzupełnienia')) + '.'
      );
    } else if (mri.performed === 'no') {
      sections.push('Badanie MRI okolicy podwzgórzowo‑przysadkowej nie było wykonywane.');
    }

    /* ── 10. Badania genetyczne ─────────────────────────────────────────── */
    const gen = sa.genetics || {};
    const genParts = [];
    if (gen.karyotype === 'done' && gen.karyotypeResult) {
      const kMap = {
        '46XX':  'kariotyp 46,XX — prawidłowy żeński',
        '46XY':  'kariotyp 46,XY — prawidłowy męski',
        '45X':   'kariotyp 45,X — Zespół Turnera',
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
      sections.push('Badania genetyczne: ' + genParts.join('; ') + '.');
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
        if (ob.alt != null) altStr += ' (' + round1(ob.alt) + ' U/L)';
        obParts.push(altStr + ' — podejrzenie NAFLD');
      }

      if (ob.thyroidNormal === 'no') {
        let thyStr = 'zaburzenia czynności tarczycy';
        if (ob.tsh != null) thyStr += ' (TSH ' + ob.tsh + ' mU/L)';
        obParts.push(thyStr);
      }

      if (obParts.length) {
        sections.push('Metaboliczne powikłania otyłości: ' + obParts.join('; ') + '.');
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
      sections.push(conclusionBuilders[sa.diagnosis](pd, sa));
    }

    /* ── Złożenie tekstu ────────────────────────────────────────────────── */
    return { text: sections.join('\n\n'), sections: sections };
  }

  /* ── EC-3: WNIOSKI PER PROFIL ─────────────────────────────────────────── */

  function buildConclusionGhd(pd, sa) {
    const gh = sa.ghTests || {};
    const peak1 = gh.test1 && gh.test1.peakGh != null ? parseFloat(gh.test1.peakGh) : null;
    const peak2 = gh.test2 && gh.test2.peakGh != null ? parseFloat(gh.test2.peakGh) : null;
    const bothLow = peak1 != null && peak1 < 10 && (peak2 == null || peak2 < 10);

    let c = 'Na podstawie przeprowadzonej diagnostyki';
    if (bothLow && peak2 != null) {
      c += ' rozpoznano niedobór hormonu wzrostu (szczyt GH poniżej 10 ng/mL w obydwu testach stymulacyjnych).';
    } else if (bothLow) {
      c += ' obraz kliniczny i wynik testu stymulacyjnego odpowiadają niedoborowi hormonu wzrostu' +
        ' (szczyt GH ' + round1(peak1).toString().replace('.', ',') + ' ng/mL).';
    } else {
      c += ' obraz kliniczny sugeruje niedobór hormonu wzrostu — wyniki wymagają weryfikacji.';
    }
    c += ' Pacjent może spełniać kryteria kwalifikacji do leczenia hormonem wzrostu w ramach programu lekowego B.19 NFZ —' +
      ' ostateczna decyzja terapeutyczna wymaga potwierdzenia w ośrodku referencyjnym.';
    return c;
  }

  function buildConclusionKowd(pd, sa) {
    const baDelay = pd.boneAgeDelay != null ? round1(pd.boneAgeDelay) : null;
    let c = 'Całość obrazu klinicznego';
    const features = [];
    if (baDelay != null && baDelay > 1) {
      features.push('opóźnienie wieku kostnego o ' + fmt1(baDelay) + ' ' + (baDelay < 2 ? 'rok' : baDelay < 5 ? 'lata' : 'lat'));
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
    c += ' Wskazane rozważenie kwalifikacji do leczenia hormonem wzrostu w ramach programu lekowego B.64 NFZ.';
    return c;
  }

  function buildConclusionTurner(pd, sa) {
    const gen = sa.genetics || {};
    let c;
    if (gen.karyotype === 'done' && gen.karyotypeResult === '45X') {
      c = 'Na podstawie badania kariotypu (45,X) rozpoznano Zespół Turnera.';
    } else if (gen.karyotype === 'done' && gen.karyotypeResult === 'mosaic') {
      c = 'Na podstawie badania kariotypu rozpoznano mozaicyzm odpowiadający Zespołowi Turnera.';
    } else {
      c = 'Obraz kliniczny sugeruje Zespół Turnera — wymagana weryfikacja kariotypem.';
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
      formatAge:     formatAge,
      sdsLabel:      sdsLabel,
      centileLabel:  centileLabel,
      ghResultLabel: ghResultLabel,
      testName:      testName,
    },
  };
}));
