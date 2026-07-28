import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function loadSafety() {
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../..'
  );
  const source = fs.readFileSync(
    path.join(repositoryRoot, 'clcr_clinical_safety.js'),
    'utf8'
  );
  const browserGlobal = {};
  const execute = new Function('window', 'globalThis', source);
  execute(browserGlobal, browserGlobal);
  return browserGlobal.ClcrClinicalSafety;
}

describe('Klirens — centralny model wieku', () => {
  const safety = loadSafety();

  it('wersjonuje wiedzę i utrzymuje EKFC za jawną bramką walidacyjną', () => {
    expect(safety.KNOWLEDGE_PROFILE).toMatchObject({
      id: 'KLIRENS_CLINICAL_RULES_2026_07_28',
      kdigo: '2024',
      eauUrolithiasis: '2026'
    });
    expect(safety.VALIDATION_GATES.ekfc).toMatchObject({
      status: 'not_enabled'
    });
    expect(safety.VALIDATION_GATES.prospectiveClinicalValidation.status)
      .toBe('required_before_clinical_release');
  });

  it('odróżnia brak miesięcy od jawnego wieku 0 lat 0 miesięcy', () => {
    expect(safety.parseAge('0', '').valid).toBe(false);
    expect(safety.parseAge('0', '0')).toMatchObject({
      valid: true,
      exactYears: 0,
      totalMonths: 0,
      group: 'child'
    });
    expect(safety.parseAge('0', '6')).toMatchObject({
      valid: true,
      exactYears: 0.5,
      totalMonths: 6,
      group: 'child'
    });
    expect(safety.parseAge('0', '0', '14')).toMatchObject({
      valid: true,
      daysOfLife: 14,
      totalMonths: 0,
      group: 'child'
    });
  });

  it('odrzuca ułamkowe miesiące, nieprawidłowe dni i wiek przekraczający 120 lat', () => {
    expect(safety.parseAge('10', '1.5').valid).toBe(false);
    expect(safety.parseAge('10', '12').valid).toBe(false);
    expect(safety.parseAge('0', '0', '29').valid).toBe(false);
    expect(safety.parseAge('1', '0', '10').valid).toBe(false);
    expect(safety.parseAge('0', '1', '10').valid).toBe(false);
    expect(safety.parseAge('120', '1').valid).toBe(false);
  });

  it('egzekwuje granice populacyjne wzorów', () => {
    const age16y11m = safety.parseAge('16', '11');
    const age17 = safety.parseAge('17', '0');
    const age17y11m = safety.parseAge('17', '11');
    const age18 = safety.parseAge('18', '0');

    expect(safety.formulaEligibility('egfr', age17y11m).eligible).toBe(false);
    expect(safety.formulaEligibility('cg', age17y11m).eligible).toBe(false);
    expect(safety.formulaEligibility('egfr', age18).eligible).toBe(true);
    expect(safety.formulaEligibility('egfr_cr_cys', age17y11m).eligible).toBe(false);
    expect(safety.formulaEligibility('egfr_cr_cys', age18).eligible).toBe(true);
    expect(safety.formulaEligibility('cg', age18).eligible).toBe(true);
    expect(safety.formulaEligibility('ckid_u25', age17y11m).eligible).toBe(true);
    expect(safety.formulaEligibility('ckid_u25', safety.parseAge('25', '11')).eligible).toBe(true);
    expect(safety.formulaEligibility('ckid_u25', safety.parseAge('26', '0')).eligible).toBe(false);
    expect(safety.formulaEligibility('ckid_u25_cys', safety.parseAge('25', '11')).eligible).toBe(true);
    expect(safety.formulaEligibility('ckid_u25_cr_cys', safety.parseAge('26', '0')).eligible).toBe(false);
    expect(safety.formulaEligibility(
      'neonatal_egfr',
      safety.parseAge('0', '0', '14')
    ).eligible).toBe(true);
    expect(safety.formulaEligibility(
      'neonatal_egfr',
      safety.parseAge('0', '1')
    ).eligible).toBe(false);
    expect(safety.formulaEligibility('sch_idms', age16y11m).eligible).toBe(true);
    expect(safety.formulaEligibility('sch_idms', age17).eligible).toBe(false);
    expect(safety.formulaEligibility('sch_var', age18).eligible).toBe(false);
    expect(safety.formulaEligibility('KTV', safety.parseAge('1', '11')).eligible).toBe(false);
    expect(safety.formulaEligibility('KTV', safety.parseAge('2', '0')).eligible).toBe(true);
    expect(safety.formulaEligibility('KTV', age17y11m).eligible).toBe(true);
    expect(safety.formulaEligibility('KTV', age18).eligible).toBe(true);
    expect(safety.formulaEligibility('cl24', safety.parseAge('', '')).eligible).toBe(true);
  });
});

describe('Klirens — równania eGFR i kontekst kreatyniny', () => {
  const safety = loadSafety();

  it('odtwarza przypadek referencyjny 2021 CKD-EPI eGFRcr', () => {
    const value = safety.computeCkdEpi2021Cr({
      sex: 'M',
      ageYears: 50,
      creatinineMgDl: 1
    });

    expect(value).toBeCloseTo(91.6914786098, 9);
    expect(safety.computeCkdEpi2021Cr({
      sex: 'M',
      ageYears: 17.99,
      creatinineMgDl: 1
    })).toBeNull();
  });

  it('odtwarza Bedside Schwartz 2009', () => {
    expect(safety.computeBedsideSchwartz({
      heightCm: 140,
      creatinineMgDl: 0.6
    })).toBeCloseTo(96.3666666667, 9);
  });

  it('odtwarza CKiD U25 eGFRcr w trzech przedziałach wieku', () => {
    expect(safety.computeCkidU25Creatinine({
      sex: 'F',
      ageYears: 10,
      heightCm: 140,
      creatinineMgDl: 0.6
    })).toBeCloseTo(82.9016019988, 9);
    expect(safety.computeCkidU25Creatinine({
      sex: 'M',
      ageYears: 15,
      heightCm: 170,
      creatinineMgDl: 1.1
    })).toBeCloseTo(68.781194625, 9);
    expect(safety.computeCkidU25Creatinine({
      sex: 'F',
      ageYears: 20,
      heightCm: 165,
      creatinineMgDl: 0.9
    })).toBeCloseTo(75.9, 9);
    expect(safety.computeCkidU25Creatinine({
      sex: 'F',
      ageYears: 25,
      heightCm: 165,
      creatinineMgDl: 0.9
    })).toBeCloseTo(75.9, 9);
    expect(safety.computeCkidU25Creatinine({
      sex: 'F',
      ageYears: 26,
      heightCm: 165,
      creatinineMgDl: 0.9
    })).toBeNull();
  });

  it('liczy wzór noworodkowy wyłącznie dla noworodka donoszonego do 28. dnia', () => {
    expect(safety.computeNeonatalEgfr({
      termBorn: true,
      bodyWeightKg: 3.4,
      daysOfLife: 14,
      heightCm: 50,
      creatinineMgDl: 0.5
    })).toBe(31);
    expect(safety.computeNeonatalEgfr({
      termBorn: false,
      bodyWeightKg: 3.4,
      daysOfLife: 14,
      heightCm: 50,
      creatinineMgDl: 0.5
    })).toBeNull();
    expect(safety.computeNeonatalEgfr({
      termBorn: true,
      bodyWeightKg: 3.4,
      daysOfLife: 29,
      heightCm: 50,
      creatinineMgDl: 0.5
    })).toBeNull();
    expect(safety.computeNeonatalEgfr({
      termBorn: true,
      bodyWeightKg: 2.5,
      daysOfLife: 14,
      heightCm: 50,
      creatinineMgDl: 0.5
    })).toBeNull();
  });

  it('blokuje wzór noworodkowy bez potwierdzenia urodzenia o czasie', () => {
    const age = safety.parseAge('0', '0', '14');
    const creatinine = safety.creatininePolicy('stable', false);

    expect(safety.formulaSafety(
      'neonatal_egfr',
      age,
      creatinine,
      { termStatus: '', bodyWeightKg: 3.4, scrAssay: 'enzymatic_idms' }
    ).eligible).toBe(false);
    expect(safety.formulaSafety(
      'neonatal_egfr',
      age,
      creatinine,
      { termStatus: 'preterm', bodyWeightKg: 3.4, scrAssay: 'enzymatic_idms' }
    ).reason).toContain('wcześniaków');
    expect(safety.formulaSafety(
      'neonatal_egfr',
      age,
      creatinine,
      { termStatus: 'term', bodyWeightKg: 3.4, scrAssay: 'enzymatic_idms' }
    ).eligible).toBe(true);
    expect(safety.formulaSafety(
      'neonatal_egfr',
      age,
      creatinine,
      { termStatus: 'term', bodyWeightKg: 2.5, scrAssay: 'enzymatic_idms' }
    ).reason).toContain('≤2,5');
    expect(safety.formulaSafety(
      'neonatal_egfr',
      age,
      creatinine,
      { termStatus: 'term', bodyWeightKg: 3.4, scrAssay: 'jaffe_idms' }
    ).reason).toContain('enzymatycznego');
  });

  it('rozróżnia pełną interpretację, oszacowanie i blokadę AKI', () => {
    expect(safety.creatininePolicy('stable', false)).toMatchObject({
      calculationAllowed: true,
      categoryAllowed: true,
      status: 'stable'
    });
    expect(safety.creatininePolicy('unknown', false)).toMatchObject({
      calculationAllowed: true,
      categoryAllowed: false,
      status: 'unknown'
    });
    expect(safety.creatininePolicy('rapidlyChanging', false)).toMatchObject({
      calculationAllowed: false,
      categoryAllowed: false,
      status: 'blocked'
    });
    expect(safety.creatininePolicy('stable', true).calculationAllowed).toBe(false);
  });

  it('blokuje wszystkie równania kreatyninowe przy szybkiej zmianie lub AKI', () => {
    const adult = safety.parseAge('50', '0');
    const blocked = safety.creatininePolicy('rapidlyChanging', false);

    for (const formulaId of [
      'egfr',
      'ckid_u25',
      'neonatal_egfr',
      'cg',
      'cg_norm',
      'cl24',
      'sch_idms',
      'TMP_GFR'
    ]) {
      const formulaAge = formulaId === 'neonatal_egfr'
        ? safety.parseAge('0', '0', '14')
        : adult;
      expect(
        safety.formulaSafety(
          formulaId,
          formulaAge,
          blocked,
          { termStatus: 'term', bodyWeightKg: 3.4, scrAssay: 'enzymatic_idms' }
        ).eligible,
        formulaId
      ).toBe(false);
    }
  });

  it.each([
    [90, 'G1'],
    [60, 'G2'],
    [45, 'G3a'],
    [30, 'G3b'],
    [15, 'G4'],
    [14.999, 'G5']
  ])('klasyfikuje niezaokrąglone eGFR %s jako %s', (value, code) => {
    expect(safety.kdigoGCategory(value).code).toBe(code);
  });

  it('pokazuje surową wartość, gdy zaokrąglenie przekracza próg KDIGO', () => {
    expect(safety.formatGfrForDisplay(59.96)).toMatchObject({
      rounded: '60',
      raw: '<60',
      crossesCategoryBoundary: true
    });
    expect(safety.formatGfrForDisplay(59.96).category.code).toBe('G3a');
    expect(safety.formatGfrForDisplay(59.999)).toMatchObject({
      rounded: '60',
      raw: '<60',
      crossesCategoryBoundary: true
    });
    expect(safety.formatGfrForDisplay(60.01)).toMatchObject({
      rounded: '60',
      raw: '',
      crossesCategoryBoundary: false
    });
  });
});

describe('Klirens — jednostki i wydalanie dobowe', () => {
  const safety = loadSafety();

  it('liczy lukę anionową bez potasu', () => {
    const input = { sodium: 140, chloride: 104, bicarbonate: 24 };
    expect(safety.computeAnionGapWithoutPotassium(input)).toBe(12);
    expect(safety.computeAnionGapWithoutPotassium({ ...input, potassium: 8 })).toBe(12);
    expect(safety.computeAnionGapWithoutPotassium({
      sodium: 140,
      chloride: 104,
      bicarbonate: null
    })).toBeNull();
  });

  it('wymaga kompletu składników UAG', () => {
    expect(safety.computeUrineAnionGap({
      sodium: 20,
      potassium: 20,
      chloride: 80
    })).toBe(-40);
    expect(safety.computeUrineAnionGap({
      sodium: 20,
      potassium: null,
      chloride: 80
    })).toBeNull();
  });

  it('zachowuje białko jako mg/24 h i przelicza na g/24 h oraz mg/m²/24 h', () => {
    const result = safety.computeProteinDzm({
      totalMg24h: 300,
      bsaM2: 1.0967
    });

    expect(result.totalMg24h).toBe(300);
    expect(result.totalG24h).toBe(0.3);
    expect(result.mgM2Per24h).toBeCloseTo(273.5479164767, 9);
  });

  it('przelicza fosfor nieorganiczny na mg/24 h i mmol/24 h', () => {
    const result = safety.computePhosphorusDzm({
      concentrationMgDl: 108.4,
      volumeMl: 1000
    });

    expect(result.totalMg24h).toBe(1084);
    expect(result.totalMmol24h).toBeCloseTo(34.9973203159, 9);
  });

  it('przelicza cystynę z mg/dL na mg/L, mg/24 h i mmol/24 h', () => {
    const result = safety.computeCystineDzm({
      concentrationMgDl: 3,
      volumeMl: 1000
    });

    expect(result.concentrationMgL).toBe(30);
    expect(result.totalMg24h).toBe(30);
    expect(result.totalMmol24h).toBeCloseTo(0.1248439451, 9);
  });
});

describe('Klirens — ACR/PCR i TmP/GFR', () => {
  const safety = loadSafety();

  it('oblicza ACR/PCR równolegle w mg/g i mg/mmol', () => {
    expect(safety.computeUrineAnalyteCreatinineRatio({
      analyteMgL: 30,
      urineCreatinine: 100,
      urineCreatinineUnit: 'mg/dl'
    })).toMatchObject({ mgG: 30 });
    expect(safety.computeUrineAnalyteCreatinineRatio({
      analyteMgL: 30,
      urineCreatinine: 100,
      urineCreatinineUnit: 'mg/dl'
    }).mgMmol).toBeCloseTo(3.3936651584, 9);
    expect(safety.computeUrineAnalyteCreatinineRatio({
      analyteMgL: 300,
      urineCreatinine: 100,
      urineCreatinineUnit: 'mg/dl'
    }).mgG).toBe(300);
  });

  it('klasyfikuje surowe ACR i ujawnia przekroczenie progu przez zaokrąglenie', () => {
    expect(safety.kdigoACategory(29.96).code).toBe('A1');
    expect(safety.kdigoACategory(30).code).toBe('A2');
    expect(safety.kdigoACategory(300).code).toBe('A2');
    expect(safety.kdigoACategory(300.01).code).toBe('A3');
    expect(safety.formatAcrForDisplay(29.96)).toMatchObject({
      rounded: '30.0',
      raw: '<30',
      crossesCategoryBoundary: true
    });
    expect(safety.formatAcrForDisplay(29.999)).toMatchObject({
      rounded: '30.0',
      raw: '<30',
      crossesCategoryBoundary: true
    });
    expect(safety.formatAcrForDisplay(300.0001)).toMatchObject({
      rounded: '300.0',
      raw: '>300',
      crossesCategoryBoundary: true
    });
  });

  it('dobiera pediatryczne progi PCR według dokładnego wieku', () => {
    expect(safety.pediatricUrineRatioThresholds(0.49)).toMatchObject({
      pcrMgG: null,
      ageBand: 'under6Months'
    });
    expect(safety.pediatricUrineRatioThresholds(1.5)).toMatchObject({
      pcrMgG: 500,
      acrMgG: null
    });
    expect(safety.pediatricUrineRatioThresholds(3)).toMatchObject({
      pcrMgG: 200,
      acrMgG: 30,
      nephroticPcrMgG: 2000
    });
    expect(safety.pediatricUrineRatioThresholds(0.5).ageBand)
      .toBe('sixMonthsToUnder2');
    expect(safety.pediatricUrineRatioThresholds(1)).toMatchObject({
      pcrMgG: 500,
      nephroticPcrMgG: 2000
    });
    expect(safety.pediatricUrineRatioThresholds(2).ageBand)
      .toBe('twoToUnder18');
    expect(safety.pediatricUrineRatioThresholds(17.999)).not.toBeNull();
    expect(safety.pediatricUrineRatioThresholds(18)).toBeNull();
  });

  const protocol = {
    sampleKind: 'secondMorning',
    pairedSameTime: true,
    overnightFasting: true,
    serumPhosphate: 1,
    serumPhosphateUnit: 'mmol/L',
    urinePhosphate: 10,
    urinePhosphateUnit: 'mmol/L',
    serumCreatinine: 0.1,
    serumCreatinineUnit: 'mmol/L',
    urineCreatinine: 10,
    urineCreatinineUnit: 'mmol/L'
  };

  it('stosuje Brodehla przed 19. rokiem i Waltona–Bijvoeta od 19. roku', () => {
    expect(safety.computeTmpGfr({
      ...protocol,
      ageYears: 18 + 11 / 12
    })).toMatchObject({
      ok: true,
      trp: 0.9,
      tmpGfrMmolL: 0.9,
      method: 'Brodehl',
      branch: 'pediatric-direct'
    });
    expect(safety.computeTmpGfr({
      ...protocol,
      ageYears: 19
    })).toMatchObject({
      ok: true,
      trp: 0.9,
      method: 'Walton–Bijvoet/Payne',
      branch: 'corrected'
    });
    expect(safety.computeTmpGfr({
      ...protocol,
      ageYears: 19
    }).tmpGfrMmolL).toBeCloseTo(0.9642857143, 9);
  });

  it('wybiera liniową gałąź Waltona–Bijvoeta dokładnie przy TRP 0,86', () => {
    const result = safety.computeTmpGfr({
      ...protocol,
      ageYears: 19,
      urinePhosphate: 14,
      serumCreatinine: 0.1,
      serumPhosphate: 1,
      urineCreatinine: 10
    });

    expect(result).toMatchObject({
      ok: true,
      trp: 0.86,
      branch: 'linear',
      tmpGfrMmolL: 0.86
    });
  });

  it('zachowuje wynik TmP/GFR po równoważnej zmianie jednostek', () => {
    const result = safety.computeTmpGfr({
      ...protocol,
      ageYears: 19,
      serumPhosphate: 3.097,
      serumPhosphateUnit: 'mg/dl',
      urinePhosphate: 30.97,
      urinePhosphateUnit: 'mg/dl',
      serumCreatinine: 100,
      serumCreatinineUnit: 'umol',
      urineCreatinine: 10000,
      urineCreatinineUnit: 'umol'
    });

    expect(result.ok).toBe(true);
    expect(result.tmpGfrMmolL).toBeCloseTo(0.9642857143, 9);
  });

  it('blokuje TmP/GFR bez protokołu lub przy niespójnym FEPO4', () => {
    expect(safety.computeTmpGfr({
      ...protocol,
      ageYears: 20,
      overnightFasting: false
    }).ok).toBe(false);
    expect(safety.computeTmpGfr({
      ...protocol,
      ageYears: 20,
      urinePhosphate: 200
    }).error).toContain('niespójne');
    expect(safety.computeTmpGfr({
      ...protocol,
      ageYears: null
    }).error).toContain('wiek');
  });
});

describe('Klirens — frakcje wydalnicze ze sparowanej próbki', () => {
  const safety = loadSafety();
  const paired = {
    urineAnalyte: 20,
    serumAnalyte: 140,
    urineCreatinine: 100,
    urineCreatinineUnit: 'mg/dl',
    serumCreatinine: 1,
    serumCreatinineUnit: 'mg/dl',
    pairedSameTime: true,
    sameUrineSpecimen: true
  };

  it('liczy FE po normalizacji jednostek kreatyniny', () => {
    const result = safety.computeFractionalExcretion(paired);
    expect(result.ok).toBe(true);
    expect(result.valuePct).toBeCloseTo(0.14285714285714285, 12);
    expect(safety.computeFractionalExcretion({
      ...paired,
      urineCreatinine: 8840,
      urineCreatinineUnit: 'umol',
      serumCreatinine: 88.4,
      serumCreatinineUnit: 'umol'
    }).valuePct).toBeCloseTo(0.14285714285714285, 12);
  });

  it('dopuszcza zerowe stężenie w moczu, ale blokuje niesparowane próbki', () => {
    expect(safety.computeFractionalExcretion({
      ...paired,
      urineAnalyte: 0
    })).toMatchObject({ ok: true, valuePct: 0 });
    expect(safety.computeFractionalExcretion({
      ...paired,
      pairedSameTime: false
    })).toMatchObject({ ok: false, valuePct: null });
  });
});

describe('Klirens — czasowa zbiórka kreatyniny', () => {
  const safety = loadSafety();
  const protocol = {
    startVoidDiscarded: true,
    finalVoidIncluded: true,
    noMissedVoids: true,
    noSpillage: true,
    noExtraVoids: true,
    storageFollowed: true,
    serumSampleDuringCollection: true
  };
  const timing24h = {
    collectionStartAt: '2026-07-27T08:00',
    collectionEndAt: '2026-07-28T08:00',
    serumSampleAt: '2026-07-27T12:00'
  };

  it('pokazuje klirens bezwzględny, znormalizowany i CER', () => {
    const result = safety.computeTimedCreatinineClearance({
      ...timing24h,
      urineCreatinineMgDl: 100,
      serumCreatinineMgDl: 1,
      volumeMl: 1440,
      bsaM2: 1.73,
      weightKg: 72,
      protocol
    });

    expect(result).toMatchObject({
      ok: true,
      absoluteMlMin: 100,
      indexedMlMin173: 100,
      creatinineMgCollection: 1440,
      creatinineMgDay: 1440,
      creatinineMgKgDay: 20
    });
  });

  it('używa rzeczywistego czasu i blokuje niepełny protokół', () => {
    expect(safety.computeTimedCreatinineClearance({
      collectionStartAt: '2026-07-27T08:00',
      collectionEndAt: '2026-07-27T20:00',
      serumSampleAt: '2026-07-27T12:00',
      urineCreatinineMgDl: 100,
      serumCreatinineMgDl: 1,
      volumeMl: 720,
      bsaM2: 1.73,
      weightKg: 72,
      protocol
    }).absoluteMlMin).toBe(100);
    expect(safety.computeTimedCreatinineClearance({
      ...timing24h,
      urineCreatinineMgDl: 100,
      serumCreatinineMgDl: 1,
      volumeMl: 1440,
      bsaM2: 1.73,
      weightKg: 72,
      protocol: { ...protocol, noMissedVoids: false }
    }).ok).toBe(false);
    expect(safety.computeTimedCreatinineClearance({
      ...timing24h,
      serumSampleAt: '2026-07-28T12:00',
      urineCreatinineMgDl: 100,
      serumCreatinineMgDl: 1,
      volumeMl: 1440,
      bsaM2: 1.73,
      weightKg: 72,
      protocol
    }).error).toContain('mieszczący się');
  });
});
