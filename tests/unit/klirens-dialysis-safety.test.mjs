import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const STREFA_BAZOWA = process.env.TZ;

function loadDialysisSafety() {
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../..'
  );
  const source = fs.readFileSync(
    path.join(repositoryRoot, 'clcr_dialysis_safety.js'),
    'utf8'
  );
  const browserGlobal = {};
  const execute = new Function('window', 'globalThis', source);
  execute(browserGlobal, browserGlobal);
  return browserGlobal.ClcrDialysisSafety;
}

const validSampling = Object.freeze({
  sameSession: true,
  preBeforeDialysis: true,
  preNoSalineHeparinDilution: true,
  postMethod: 'slow_flow_100ml_15s'
});

function validAdult(overrides = {}) {
  return {
    ageYears: 50,
    ageMonths: 0,
    modality: 'IHD',
    sessionsPerWeek: 3,
    pidiDays: 2,
    preUrea: 120,
    postUrea: 36,
    ureaAnalyte: 'BUN',
    ureaUnit: 'mg/dL',
    durationMinutes: 240,
    netUfLiters: 2,
    postWeightKg: 70,
    accessType: 'AVF/AVG',
    kruValue: 1.5,
    kruUnit: 'mL/min/1.73m²',
    kruMeasuredAt: '2026-06-01',
    evaluationDate: '2026-07-28',
    treatmentsDeliveredReliably: true,
    sampling: validSampling,
    ...overrides
  };
}

function errorCodes(result) {
  return result.messages.errors.map((message) => message.code);
}

function warningCodes(result) {
  return result.messages.warnings.map((message) => message.code);
}

describe('Klirens — izolowany moduł bezpieczeństwa dializy', () => {
  const dialysis = loadDialysisSafety();

  it('udostępnia API UMD i zamrożony wynik', () => {
    expect(typeof dialysis.computeDialysisAdequacy).toBe('function');
    expect(typeof dialysis.localIsoDate).toBe('function');
    const result = dialysis.computeDialysisAdequacy(validAdult());
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.values)).toBe(true);
  });

  it('odtwarza przypadek KT01: spKt/V, eKt/V AV i URR', () => {
    const result = dialysis.computeDialysisAdequacy(validAdult());

    expect(result.ok).toBe(true);
    expect(result.values).toMatchObject({
      ratio: 0.3,
      gfac: 0.008,
      urrPct: 70
    });
    expect(result.values.spKtV).toBeCloseTo(1.4010540128, 9);
    expect(result.values.eKtV).toBeCloseTo(1.2227380475, 9);
    expect(result.metadata.eKtVMethod).toEqual({
      access: 'AVF/AVG',
      constantMinutes: 35
    });
    expect(result.classification).toMatchObject({
      interpretationAllowed: true,
      basis: 'unrounded_values',
      spKtV: { code: 'TARGET_MET' },
      urr: { code: 'TARGET_MET' }
    });
  });

  it('używa C=22 dla CVC i nie zmienia spKt/V', () => {
    const result = dialysis.computeDialysisAdequacy(
      validAdult({ accessType: 'CVC' })
    );

    expect(result.ok).toBe(true);
    expect(result.values.spKtV).toBeCloseTo(1.4010540128, 9);
    expect(result.values.eKtV).toBeCloseTo(1.2834082560, 9);
    expect(result.metadata.eKtVMethod).toEqual({
      access: 'CVC',
      constantMinutes: 22
    });
  });

  it('dopuszcza UF=0 i zachowuje wynik skończony', () => {
    const result = dialysis.computeDialysisAdequacy(
      validAdult({
        preUrea: 100,
        postUrea: 30,
        netUfLiters: 0
      })
    );

    expect(result.ok).toBe(true);
    expect(result.values.spKtV).toBeCloseTo(1.3167682985, 9);
    expect(result.values.eKtV).toBeCloseTo(1.1491796059, 9);
  });

  it('wylicza eKt/V dopiero po wskazaniu dostępu', () => {
    const result = dialysis.computeDialysisAdequacy(
      validAdult({ accessType: 'unknown' })
    );

    expect(result.ok).toBe(true);
    expect(result.values.spKtV).toBeCloseTo(1.4010540128, 9);
    expect(result.values.eKtV).toBeNull();
    expect(result.metadata.eKtVMethod).toBeNull();
    expect(warningCodes(result)).toContain(
      'ACCESS_UNKNOWN_EKTV_NOT_CALCULATED'
    );
  });
});

describe('Klirens — exact GFAC według częstości i PIDI', () => {
  const dialysis = loadDialysisSafety();
  const supported = [
    [2, 3, 0.0055],
    [2, 4, 0.0045],
    [3, 2, 0.0080],
    [3, 3, 0.0060],
    [4, 1, 0.0155],
    [4, 2, 0.0090],
    [5, 1, 0.0175],
    [5, 2, 0.0095],
    [6, 1, 0.0175],
    [6, 2, 0.0095],
    [7, 1, 0.0175],
    [7, 2, 0.0175]
  ];

  it.each(supported)(
    'dobiera GFAC dla %i sesji/tydz. i PIDI %i dni: %f',
    (sessionsPerWeek, pidiDays, expected) => {
      const result = dialysis.computeDialysisAdequacy(
        validAdult({ sessionsPerWeek, pidiDays })
      );
      expect(result.ok).toBe(true);
      expect(result.values.gfac).toBe(expected);
      expect(result.metadata.gfacLookupKey).toBe(
        `${sessionsPerWeek}/week:${pidiDays}d`
      );
    }
  );

  it('stosuje GFAC=0,006 po 3-dniowym PIDI w schemacie 3×/tydz.', () => {
    const result = dialysis.computeDialysisAdequacy(
      validAdult({ pidiDays: 3 })
    );

    expect(result.ok).toBe(true);
    expect(result.values.spKtV).toBeCloseTo(1.3716401276, 9);
  });

  it.each([
    [2, 2],
    [3, 1],
    [4, 3],
    [5, 3],
    [6, 4],
    [7, 3]
  ])(
    'blokuje niewymienioną parę zamiast interpolacji: %i/tydz., PIDI %i',
    (sessionsPerWeek, pidiDays) => {
      const result = dialysis.computeDialysisAdequacy(
        validAdult({ sessionsPerWeek, pidiDays })
      );
      expect(result.ok).toBe(false);
      expect(errorCodes(result)).toContain('GFAC_UNAVAILABLE');
    }
  );

  it.each([5, 6, 7])(
    'blokuje nieustaloną korektę GFAC dla >300 min przy %i/tydz.',
    (sessionsPerWeek) => {
      const result = dialysis.computeDialysisAdequacy(
        validAdult({
          sessionsPerWeek,
          pidiDays: 1,
          durationMinutes: 301
        })
      );
      expect(result.ok).toBe(false);
      expect(errorCodes(result)).toContain('GFAC_LONG_SESSION_UNSUPPORTED');
    }
  );
});

describe('Klirens — klasyfikacja tylko na surowych wartościach', () => {
  const dialysis = loadDialysisSafety();

  it.each([
    [32, 'MINIMUM_MET_BELOW_TARGET'],
    [36, 'BELOW_MINIMUM']
  ])(
    'klasyfikuje post=%f bez użycia wartości zaokrąglonej',
    (postUrea, code) => {
      const result = dialysis.computeDialysisAdequacy(
        validAdult({ preUrea: 100, postUrea })
      );
      expect(result.ok).toBe(true);
      expect(result.classification.spKtV.code).toBe(code);
    }
  );

  it.each([
    [1.199, 'BELOW_MINIMUM', '<1.20'],
    [1.2, 'MINIMUM_MET_BELOW_TARGET', '1.20'],
    [1.399, 'MINIMUM_MET_BELOW_TARGET', '<1.40'],
    [1.4, 'TARGET_MET', '1.40']
  ])(
    'nie przekracza wizualnie progu dla surowego spKt/V=%f',
    (desiredSpKtV, expectedCode, expectedDisplay) => {
      const ratio = Math.exp(-desiredSpKtV) + 0.008 * 4;
      const result = dialysis.computeDialysisAdequacy(
        validAdult({
          preUrea: 100,
          postUrea: ratio * 100,
          netUfLiters: 0
        })
      );

      expect(result.ok).toBe(true);
      expect(result.values.spKtV).toBeCloseTo(desiredSpKtV, 12);
      expect(result.classification.spKtV.code).toBe(expectedCode);
      expect(result.display.spKtV).toBe(expectedDisplay);
    }
  );

  it.each([
    [30, 'TARGET_MET'],
    [32, 'MINIMUM_MET_BELOW_TARGET'],
    [36, 'BELOW_MINIMUM']
  ])('klasyfikuje URR pomocniczo dla post=%f', (postUrea, code) => {
    const result = dialysis.computeDialysisAdequacy(
      validAdult({ preUrea: 100, postUrea })
    );
    expect(result.classification.urr.code).toBe(code);
  });

  it.each([
    [64.96, 'BELOW_MINIMUM', '<65.0'],
    [65, 'MINIMUM_MET_BELOW_TARGET', '65.0'],
    [69.96, 'MINIMUM_MET_BELOW_TARGET', '<70.0'],
    [70, 'TARGET_MET', '70.0']
  ])(
    'nie przekracza wizualnie progu dla surowego URR=%f%%',
    (desiredUrr, expectedCode, expectedDisplay) => {
      const result = dialysis.computeDialysisAdequacy(
        validAdult({
          preUrea: 100,
          postUrea: 100 - desiredUrr
        })
      );

      expect(result.ok).toBe(true);
      expect(result.values.urrPct).toBeCloseTo(desiredUrr, 12);
      expect(result.classification.urr.code).toBe(expectedCode);
      expect(result.display.urrPct).toBe(expectedDisplay);
    }
  );

  it('nie stosuje minimum URR 65% dla sesji trwającej dokładnie 5 h', () => {
    const result = dialysis.computeDialysisAdequacy(
      validAdult({ durationMinutes: 300 })
    );

    expect(result.ok).toBe(true);
    expect(result.classification.spKtV).not.toBeNull();
    expect(result.classification.urr).toBeNull();
    expect(warningCodes(result)).toContain(
      'URR_THRESHOLD_TIME_UNSUPPORTED'
    );
  });
});

describe('Klirens — warunki interpretacji 1,2/1,4', () => {
  const dialysis = loadDialysisSafety();

  afterEach(() => {
    process.env.TZ = STREFA_BAZOWA;
  });

  // Poprzednia wersja tego strażnika brała jedną chwilę (00:30 lokalnie) i nie deklarowała strefy.
  // Na WSCHÓD od UTC faktycznie rozdzielała dobę lokalną od UTC, ale na ZACHÓD (offset ≥ 0)
  // 00:30 lokalnie to ta sama doba UTC — więc zepsuta implementacja `toISOString().slice(0, 10)`
  // też by przeszła. Strażnik ma gryźć z obu stron: raz UTC wyprzedza dobę lokalną, raz zostaje w tyle.
  it.each([
    ['Pacific/Chatham', -765, [2026, 6, 28, 0, 30], '2026-07-28', '2026-07-27'],
    ['America/Los_Angeles', 420, [2026, 6, 28, 23, 30], '2026-07-28', '2026-07-29']
  ])(
    'formatuje datę oceny według lokalnego dnia, a nie UTC (%s)',
    (strefa, offset, czesci, oczekiwanyLokalny, dzienUtc) => {
      process.env.TZ = strefa;
      const chwila = new Date(...czesci);
      expect(chwila.getTimezoneOffset()).toBe(offset);
      // kontrola negatywna: doba UTC tej chwili jest inna niż lokalna
      expect(chwila.toISOString().slice(0, 10)).toBe(dzienUtc);
      expect(dialysis.localIsoDate(chwila)).toBe(oczekiwanyLokalny);
    }
  );

  it('wymaga aktualnego Kru <2 mL/min/1,73 m²', () => {
    const stale = dialysis.computeDialysisAdequacy(
      validAdult({ kruMeasuredAt: '2026-04-27' })
    );
    const exactlyTwo = dialysis.computeDialysisAdequacy(
      validAdult({ kruValue: 2 })
    );
    const unknown = dialysis.computeDialysisAdequacy(
      validAdult({
        kruValue: null,
        kruUnit: null,
        kruMeasuredAt: null
      })
    );

    expect(stale.ok).toBe(true);
    expect(stale.classification.interpretationAllowed).toBe(false);
    expect(stale.classification.blockers).toContain('KRU_NOT_CURRENT');
    expect(warningCodes(stale)).toContain('KRU_STALE');
    expect(exactlyTwo.classification.blockers).toContain('KRU_NOT_BELOW_2');
    expect(unknown.classification.blockers).toEqual(
      expect.arrayContaining(['KRU_NOT_CURRENT', 'KRU_NOT_BELOW_2'])
    );
  });

  it('uznaje pomiar dokładnie w dniu upływu trzech miesięcy', () => {
    const result = dialysis.computeDialysisAdequacy(
      validAdult({
        kruMeasuredAt: '2026-04-28',
        evaluationDate: '2026-07-28'
      })
    );

    expect(result.ok).toBe(true);
    expect(result.metadata.kru.current).toBe(true);
    expect(result.classification.interpretationAllowed).toBe(true);
  });

  it('wymaga potwierdzenia regularnego dostarczania pełnych sesji', () => {
    const result = dialysis.computeDialysisAdequacy(
      validAdult({ treatmentsDeliveredReliably: false })
    );

    expect(result.ok).toBe(true);
    expect(result.classification.interpretationAllowed).toBe(false);
    expect(result.classification.blockers).toContain(
      'REGULAR_DELIVERY_NOT_CONFIRMED'
    );
  });

  it.each([2, 4, 5, 6, 7])(
    'dla schematu %i×/tydz. zwraca wynik bez progów sesyjnych',
    (sessionsPerWeek) => {
      const pidiDays = sessionsPerWeek === 2 ? 3 : 1;
      const result = dialysis.computeDialysisAdequacy(
        validAdult({ sessionsPerWeek, pidiDays })
      );

      expect(result.ok).toBe(true);
      expect(result.classification.interpretationAllowed).toBe(false);
      expect(result.classification.spKtV).toBeNull();
      expect(result.classification.blockers).toContain(
        'SCHEDULE_NOT_THRICE_WEEKLY'
      );
      expect(warningCodes(result)).toContain('WEEKLY_STDKTV_REQUIRED');
    }
  );
});

describe('Klirens — zachowanie pediatryczne', () => {
  const dialysis = loadDialysisSafety();

  it('dla dziecka ≥2 lat pokazuje tylko techniczne spKt/V i URR', () => {
    const result = dialysis.computeDialysisAdequacy(
      validAdult({ ageYears: 10, ageMonths: 0 })
    );

    expect(result.ok).toBe(true);
    expect(result.values.spKtV).toBeCloseTo(1.4010540128, 9);
    expect(result.values.urrPct).toBe(70);
    expect(result.values.eKtV).toBeNull();
    expect(result.classification.interpretationAllowed).toBe(false);
    expect(result.classification.spKtV).toBeNull();
    expect(result.classification.urr).toBeNull();
    expect(warningCodes(result)).toEqual(
      expect.arrayContaining([
        'PEDIATRIC_EKTV_NOT_CALCULATED',
        'PEDIATRIC_RAW_RESULT_ONLY'
      ])
    );
  });

  it('blokuje niemowlę i małe dziecko poniżej 2 lat', () => {
    const result = dialysis.computeDialysisAdequacy(
      validAdult({ ageYears: 1, ageMonths: 11 })
    );

    expect(result.ok).toBe(false);
    expect(errorCodes(result)).toContain('PEDIATRIC_INFANT_UNSUPPORTED');
  });

  it('blokuje pediatryczny protokół stop-dialysate-flow', () => {
    const result = dialysis.computeDialysisAdequacy(
      validAdult({
        ageYears: 10,
        sampling: {
          ...validSampling,
          postMethod: 'stop_dialysate_3min'
        }
      })
    );

    expect(result.ok).toBe(false);
    expect(errorCodes(result)).toContain(
      'PEDIATRIC_STOP_DIALYSATE_UNVALIDATED'
    );
  });
});

describe('Klirens — protokół próbek, jednostki i błędy dziedziny', () => {
  const dialysis = loadDialysisSafety();

  it.each([
    ['sameSession', 'SAMPLES_NOT_CONFIRMED_SAME_SESSION'],
    ['preBeforeDialysis', 'PRE_SAMPLE_TIMING_INVALID'],
    ['preNoSalineHeparinDilution', 'PRE_SAMPLE_DILUTION_NOT_EXCLUDED']
  ])('wymaga potwierdzenia sampling.%s', (field, code) => {
    const result = dialysis.computeDialysisAdequacy(
      validAdult({
        sampling: { ...validSampling, [field]: false }
      })
    );
    expect(result.ok).toBe(false);
    expect(errorCodes(result)).toContain(code);
  });

  it('akceptuje dorosły protokół stop-dialysate-flow 3 min', () => {
    const result = dialysis.computeDialysisAdequacy(
      validAdult({
        sampling: {
          ...validSampling,
          postMethod: 'stop_dialysate_3min'
        }
      })
    );
    expect(result.ok).toBe(true);
    expect(result.metadata.samplingPostMethod).toBe('stop_dialysate_3min');
  });

  it('wymaga tego samego analitu i tej samej jednostki', () => {
    const analyteMismatch = dialysis.computeDialysisAdequacy(
      validAdult({
        preAnalyte: 'BUN',
        postAnalyte: 'urea'
      })
    );
    const unitMismatch = dialysis.computeDialysisAdequacy(
      validAdult({
        preUnit: 'mg/dL',
        postUnit: 'mmol/L'
      })
    );

    expect(errorCodes(analyteMismatch)).toContain('UREA_ANALYTE_MISMATCH');
    expect(errorCodes(unitMismatch)).toContain('UREA_UNIT_MISMATCH');
  });

  it('stosunek jest niezależny od wspólnej skali jednostki', () => {
    const mgDl = dialysis.computeDialysisAdequacy(validAdult());
    const mgL = dialysis.computeDialysisAdequacy(
      validAdult({
        preUrea: 1200,
        postUrea: 360,
        ureaUnit: 'mg/L'
      })
    );

    expect(mgL.ok).toBe(true);
    expect(mgL.values.ratio).toBe(mgDl.values.ratio);
    expect(mgL.values.spKtV).toBe(mgDl.values.spKtV);
  });

  it.each([
    [{ preUrea: 0 }, 'PRE_UREA_INVALID'],
    [{ postUrea: 0 }, 'POST_UREA_INVALID'],
    [{ postUrea: 120 }, 'UREA_RATIO_INVALID'],
    [{ postUrea: 121 }, 'UREA_RATIO_INVALID'],
    [{ durationMinutes: 0 }, 'DURATION_INVALID'],
    [{ durationMinutes: 481 }, 'DURATION_INVALID'],
    [{ netUfLiters: -0.1 }, 'NET_UF_INVALID'],
    [{ netUfLiters: 10.1 }, 'NET_UF_INVALID'],
    [{ postWeightKg: 0 }, 'POST_WEIGHT_INVALID'],
    [{ postWeightKg: 301 }, 'POST_WEIGHT_INVALID'],
    [{ modality: 'PD' }, 'MODALITY_UNSUPPORTED'],
    [{ sessionsPerWeek: 1 }, 'FREQUENCY_UNSUPPORTED'],
    [{ pidiDays: 2.5 }, 'PIDI_INVALID']
  ])('zwraca jawny kod błędu dla %o', (overrides, code) => {
    const result = dialysis.computeDialysisAdequacy(validAdult(overrides));
    expect(result.ok).toBe(false);
    expect(errorCodes(result)).toContain(code);
  });

  it('wykrywa niedodatni argument logarytmu', () => {
    const result = dialysis.computeDialysisAdequacy(
      validAdult({
        preUrea: 100,
        postUrea: 3,
        netUfLiters: 0
      })
    );

    expect(result.ok).toBe(false);
    expect(errorCodes(result)).toContain('DAUGIRDAS_DOMAIN_ERROR');
  });

  it('odrzuca nieprawidłową jednostkę Kru i datę oceny', () => {
    const wrongUnit = dialysis.computeDialysisAdequacy(
      validAdult({ kruUnit: 'mL/s' })
    );
    const wrongDate = dialysis.computeDialysisAdequacy(
      validAdult({ evaluationDate: '2026-02-30' })
    );

    expect(errorCodes(wrongUnit)).toContain('KRU_UNIT_INVALID');
    expect(errorCodes(wrongDate)).toContain('EVALUATION_DATE_INVALID');
  });
});
