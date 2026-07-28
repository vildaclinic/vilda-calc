import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function loadExtendedEgfr() {
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../..'
  );
  const source = fs.readFileSync(
    path.join(repositoryRoot, 'clcr_extended_egfr.js'),
    'utf8'
  );
  const browserGlobal = {};
  const execute = new Function('window', 'globalThis', source);
  execute(browserGlobal, browserGlobal);
  return browserGlobal.ClcrExtendedEgfr;
}

const MARKERS = Object.freeze({
  creatinineStandardization: 'IDMS',
  cystatinCUnit: 'mg/L',
  cystatinCStandardization: 'ERM-DA471/IFCC'
});

describe('Klirens extended eGFR — kontrakt UMD i wyników', () => {
  const extended = loadExtendedEgfr();

  it('udostępnia cztery wymagane obliczenia bez zależności od DOM', () => {
    expect(extended).toBeTruthy();
    expect(extended.computeHaycockBsa).toBeTypeOf('function');
    expect(extended.computeCkdEpi2021CrCys).toBeTypeOf('function');
    expect(extended.computeCkidU25Cys).toBeTypeOf('function');
    expect(extended.computeCkidU25CrCys).toBeTypeOf('function');
  });

  it('zwraca stabilny obiekt ok zamiast nieopisanej liczby', () => {
    const result = extended.computeHaycockBsa({
      ageYears: 10,
      heightValue: 140,
      heightUnit: 'cm',
      weightValue: 30,
      weightUnit: 'kg'
    });

    expect(result).toMatchObject({
      ok: true,
      unit: 'm²',
      equation: 'Haycock BSA (pediatric application policy)',
      code: '',
      error: '',
      field: ''
    });
    expect(result.value).toBeTypeOf('number');
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.details)).toBe(true);
  });

  it('zwraca stabilny obiekt error z kodem i polem', () => {
    const result = extended.computeHaycockBsa({
      ageYears: 10,
      heightValue: 140,
      heightUnit: 'm',
      weightValue: 30,
      weightUnit: 'kg'
    });

    expect(result).toMatchObject({
      ok: false,
      value: null,
      unit: 'm²',
      code: 'HEIGHT_UNIT_INVALID',
      field: 'heightUnit'
    });
    expect(result.error).toContain('cm');
    expect(Object.isFrozen(result)).toBe(true);
  });
});

describe('Klirens extended eGFR — BSA Haycocka', () => {
  const extended = loadExtendedEgfr();

  it.each([
    [
      {
        ageYears: 0,
        heightValue: 50,
        heightUnit: 'cm',
        weightValue: 3.5,
        weightUnit: 'kg'
      },
      0.22441495743552514
    ],
    [
      {
        ageYears: 10,
        heightValue: 140,
        heightUnit: 'cm',
        weightValue: 30,
        weightUnit: 'kg'
      },
      1.0717691690196336
    ],
    [
      {
        ageYears: 17.999,
        heightValue: 165,
        heightUnit: 'cm',
        weightValue: 60,
        weightUnit: 'kg'
      },
      1.6606598033454587
    ]
  ])('odtwarza wzór 0,024265 × H^0,3964 × W^0,5378', (input, expected) => {
    const result = extended.computeHaycockBsa(input);

    expect(result.ok).toBe(true);
    expect(result.value).toBeCloseTo(expected, 12);
  });

  it('egzekwuje pediatryczną politykę wieku bez skrytego przełączenia wzoru', () => {
    const base = {
      heightValue: 165,
      heightUnit: 'cm',
      weightValue: 60,
      weightUnit: 'kg'
    };

    expect(extended.computeHaycockBsa({ ...base, ageYears: 17.999 }).ok).toBe(true);
    expect(extended.computeHaycockBsa({ ...base, ageYears: 18 })).toMatchObject({
      ok: false,
      code: 'AGE_OUT_OF_RANGE',
      field: 'ageYears'
    });
    expect(extended.computeHaycockBsa({ ...base, ageYears: -0.001 }).ok).toBe(false);
  });

  it('wymaga dodatnich wartości i jawnych jednostek cm oraz kg', () => {
    const valid = {
      ageYears: 8,
      heightValue: 125,
      heightUnit: 'cm',
      weightValue: 25,
      weightUnit: 'kg'
    };

    expect(extended.computeHaycockBsa({ ...valid, heightValue: 0 })).toMatchObject({
      ok: false,
      code: 'HEIGHT_VALUE_INVALID',
      field: 'heightValue'
    });
    expect(extended.computeHaycockBsa({ ...valid, weightValue: -1 })).toMatchObject({
      ok: false,
      code: 'WEIGHT_VALUE_INVALID',
      field: 'weightValue'
    });
    expect(extended.computeHaycockBsa({ ...valid, weightUnit: 'g' })).toMatchObject({
      ok: false,
      code: 'WEIGHT_UNIT_INVALID',
      field: 'weightUnit'
    });
  });
});

describe('Klirens extended eGFR — 2021 CKD-EPI creatinine-cystatin C', () => {
  const extended = loadExtendedEgfr();

  const adultInput = Object.freeze({
    ageYears: 50,
    sex: 'M',
    creatinineValue: 1,
    creatinineUnit: 'mg/dL',
    ...MARKERS,
    cystatinCValue: 1
  });

  it.each([
    [
      {
        ...adultInput,
        ageYears: 50,
        sex: 'M',
        creatinineValue: 1,
        cystatinCValue: 1
      },
      88.14399054363913
    ],
    [
      {
        ...adultInput,
        ageYears: 60,
        sex: 'F',
        creatinineValue: 0.7,
        cystatinCValue: 0.8
      },
      102.83393662907125
    ],
    [
      {
        ...adultInput,
        ageYears: 40,
        sex: 'F',
        creatinineValue: 1.2,
        cystatinCValue: 1.5
      },
      50.85590718536419
    ],
    [
      {
        ...adultInput,
        ageYears: 80,
        sex: 'M',
        creatinineValue: 2,
        cystatinCValue: 2
      },
      31.355899017851897
    ]
  ])('odtwarza niezależny wektor referencyjny %#', (input, expected) => {
    const result = extended.computeCkdEpi2021CrCys(input);

    expect(result).toMatchObject({
      ok: true,
      unit: 'mL/min/1.73 m²',
      equation: '2021 CKD-EPI eGFRcr-cys'
    });
    expect(result.value).toBeCloseTo(expected, 11);
  });

  it('daje ten sam wynik po jawnej konwersji kreatyniny z µmol/L i ASCII umol/L', () => {
    const conventional = extended.computeCkdEpi2021CrCys(adultInput);
    const siUnicode = extended.computeCkdEpi2021CrCys({
      ...adultInput,
      creatinineValue: 88.4,
      creatinineUnit: 'µmol/L'
    });
    const siAscii = extended.computeCkdEpi2021CrCys({
      ...adultInput,
      creatinineValue: 88.4,
      creatinineUnit: 'umol/L'
    });

    expect(conventional.ok).toBe(true);
    expect(siUnicode.value).toBeCloseTo(conventional.value, 13);
    expect(siAscii.value).toBeCloseTo(conventional.value, 13);
    expect(siUnicode.details.creatinineMgDl).toBeCloseTo(1, 13);
  });

  it('egzekwuje dolną i aplikacyjną górną granicę wieku', () => {
    expect(extended.computeCkdEpi2021CrCys({
      ...adultInput,
      ageYears: 17.999
    })).toMatchObject({
      ok: false,
      code: 'AGE_OUT_OF_RANGE'
    });
    expect(extended.computeCkdEpi2021CrCys({
      ...adultInput,
      ageYears: 18
    }).ok).toBe(true);
    expect(extended.computeCkdEpi2021CrCys({
      ...adultInput,
      ageYears: 120
    }).ok).toBe(true);
    expect(extended.computeCkdEpi2021CrCys({
      ...adultInput,
      ageYears: 120.001
    }).ok).toBe(false);
  });

  it('nie zgaduje płci, jednostki ani standaryzacji markerów', () => {
    expect(extended.computeCkdEpi2021CrCys({
      ...adultInput,
      sex: ''
    })).toMatchObject({
      ok: false,
      code: 'SEX_INVALID',
      field: 'sex'
    });
    expect(extended.computeCkdEpi2021CrCys({
      ...adultInput,
      creatinineUnit: 'mg/L'
    })).toMatchObject({
      ok: false,
      code: 'CREATININE_UNIT_INVALID',
      field: 'creatinineUnit'
    });
    expect(extended.computeCkdEpi2021CrCys({
      ...adultInput,
      creatinineStandardization: ''
    })).toMatchObject({
      ok: false,
      code: 'CREATININE_STANDARDIZATION_REQUIRED'
    });
    expect(extended.computeCkdEpi2021CrCys({
      ...adultInput,
      cystatinCUnit: 'mg/dL'
    })).toMatchObject({
      ok: false,
      code: 'CYSTATIN_C_UNIT_INVALID',
      field: 'cystatinCUnit'
    });
    expect(extended.computeCkdEpi2021CrCys({
      ...adultInput,
      cystatinCStandardization: 'unknown'
    })).toMatchObject({
      ok: false,
      code: 'CYSTATIN_C_STANDARDIZATION_REQUIRED'
    });
  });

  it('jest ciągły przy progach SCr/κ=1 i Scys/0,8=1', () => {
    const epsilon = 1e-10;
    const atThreshold = extended.computeCkdEpi2021CrCys({
      ...adultInput,
      ageYears: 60,
      sex: 'F',
      creatinineValue: 0.7,
      cystatinCValue: 0.8
    });
    const below = extended.computeCkdEpi2021CrCys({
      ...adultInput,
      ageYears: 60,
      sex: 'F',
      creatinineValue: 0.7 - epsilon,
      cystatinCValue: 0.8 - epsilon
    });
    const above = extended.computeCkdEpi2021CrCys({
      ...adultInput,
      ageYears: 60,
      sex: 'F',
      creatinineValue: 0.7 + epsilon,
      cystatinCValue: 0.8 + epsilon
    });

    expect(below.value).toBeCloseTo(atThreshold.value, 7);
    expect(above.value).toBeCloseTo(atThreshold.value, 7);
  });
});

describe('Klirens extended eGFR — CKiD U25 cystatin C', () => {
  const extended = loadExtendedEgfr();

  const cystatinInput = Object.freeze({
    ageYears: 10,
    sex: 'F',
    cystatinCValue: 0.8,
    cystatinCUnit: 'mg/L',
    cystatinCStandardization: 'ERM-DA471/IFCC'
  });

  it.each([
    [{ ...cystatinInput, ageYears: 10, sex: 'F', cystatinCValue: 0.8 }, 99.08076855922923],
    [{ ...cystatinInput, ageYears: 12, sex: 'F', cystatinCValue: 0.9 }, 88.77777777777779],
    [{ ...cystatinInput, ageYears: 15, sex: 'M', cystatinCValue: 1.1 }, 79.27272727272727],
    [{ ...cystatinInput, ageYears: 17, sex: 'M', cystatinCValue: 1 }, 80.36352],
    [{ ...cystatinInput, ageYears: 20, sex: 'F', cystatinCValue: 1 }, 68.3]
  ])('odtwarza współczynnik κ właściwy dla płci i wieku %#', (input, expected) => {
    const result = extended.computeCkidU25Cys(input);

    expect(result.ok).toBe(true);
    expect(result.value).toBeCloseTo(expected, 11);
    expect(result.warnings[0]).toContain('przesiewu');
  });

  it('ma ciągłe gałęzie żeńskie przy 12 latach i męskie przy 15 latach', () => {
    const epsilon = 1e-8;
    const femaleBelow = extended.computeCkidU25Cys({
      ...cystatinInput,
      ageYears: 12 - epsilon,
      sex: 'F',
      cystatinCValue: 1
    });
    const femaleAt = extended.computeCkidU25Cys({
      ...cystatinInput,
      ageYears: 12,
      sex: 'F',
      cystatinCValue: 1
    });
    const maleBelow = extended.computeCkidU25Cys({
      ...cystatinInput,
      ageYears: 15 - epsilon,
      sex: 'M',
      cystatinCValue: 1
    });
    const maleAt = extended.computeCkidU25Cys({
      ...cystatinInput,
      ageYears: 15,
      sex: 'M',
      cystatinCValue: 1
    });

    expect(femaleBelow.value).toBeCloseTo(femaleAt.value, 6);
    expect(maleBelow.value).toBeCloseTo(maleAt.value, 6);
    expect(femaleAt.details.kappa).toBe(79.9);
    expect(maleAt.details.kappa).toBe(87.2);
  });

  it('egzekwuje zakres wieku 1–25 lat, do dnia poprzedzającego 26. urodziny', () => {
    expect(extended.computeCkidU25Cys({
      ...cystatinInput,
      ageYears: 0.999
    })).toMatchObject({
      ok: false,
      code: 'AGE_OUT_OF_RANGE'
    });
    expect(extended.computeCkidU25Cys({
      ...cystatinInput,
      ageYears: 1
    }).ok).toBe(true);
    expect(extended.computeCkidU25Cys({
      ...cystatinInput,
      ageYears: 25.999
    }).ok).toBe(true);
    expect(extended.computeCkidU25Cys({
      ...cystatinInput,
      ageYears: 26
    })).toMatchObject({
      ok: false,
      code: 'AGE_OUT_OF_RANGE'
    });
  });

  it('akceptuje wyłącznie dodatnią cystatynę C w mg/L z identyfikowalnością IFCC', () => {
    expect(extended.computeCkidU25Cys({
      ...cystatinInput,
      cystatinCValue: 0
    })).toMatchObject({
      ok: false,
      code: 'CYSTATIN_C_VALUE_INVALID'
    });
    expect(extended.computeCkidU25Cys({
      ...cystatinInput,
      cystatinCUnit: 'µmol/L'
    })).toMatchObject({
      ok: false,
      code: 'CYSTATIN_C_UNIT_INVALID'
    });
    expect(extended.computeCkidU25Cys({
      ...cystatinInput,
      cystatinCStandardization: ''
    })).toMatchObject({
      ok: false,
      code: 'CYSTATIN_C_STANDARDIZATION_REQUIRED'
    });
    expect(extended.computeCkidU25Cys({
      ...cystatinInput,
      cystatinCStandardization: 'ERM-DA471_IFCC'
    }).ok).toBe(true);
  });
});

describe('Klirens extended eGFR — średnia CKiD U25 creatinine-cystatin C', () => {
  const extended = loadExtendedEgfr();

  const combinedInput = Object.freeze({
    ageYears: 10,
    sex: 'F',
    heightValue: 140,
    heightUnit: 'cm',
    creatinineValue: 0.6,
    creatinineUnit: 'mg/dL',
    creatinineStandardization: 'IDMS',
    cystatinCValue: 0.8,
    cystatinCUnit: 'mg/L',
    cystatinCStandardization: 'ERM-DA471/IFCC'
  });

  it.each([
    [
      combinedInput,
      {
        creatinine: 82.90160199882422,
        cystatin: 99.08076855922923,
        average: 90.99118527902672
      }
    ],
    [
      {
        ...combinedInput,
        ageYears: 15,
        sex: 'M',
        heightValue: 170,
        creatinineValue: 1.1,
        cystatinCValue: 1.1
      },
      {
        creatinine: 68.78119462499998,
        cystatin: 79.27272727272727,
        average: 74.02696094886363
      }
    ],
    [
      {
        ...combinedInput,
        ageYears: 20,
        sex: 'F',
        heightValue: 165,
        creatinineValue: 0.9,
        cystatinCValue: 1
      },
      {
        creatinine: 75.89999999999999,
        cystatin: 68.3,
        average: 72.1
      }
    ]
  ])('liczy średnią arytmetyczną dwóch wyników U25 %#', (input, expected) => {
    const result = extended.computeCkidU25CrCys(input);

    expect(result).toMatchObject({
      ok: true,
      unit: 'mL/min/1.73 m²',
      equation: 'CKiD U25 eGFRcr-cys'
    });
    expect(result.details.egfrCreatinine).toBeCloseTo(expected.creatinine, 10);
    expect(result.details.egfrCystatin).toBeCloseTo(expected.cystatin, 10);
    expect(result.value).toBeCloseTo(expected.average, 10);
    expect(result.value).toBeCloseTo(
      (result.details.egfrCreatinine + result.details.egfrCystatin) / 2,
      13
    );
  });

  it('normalizuje wyłącznie jawnie opisane cm/m i mg/dL/µmol/L', () => {
    const conventional = extended.computeCkidU25CrCys(combinedInput);
    const si = extended.computeCkidU25CrCys({
      ...combinedInput,
      heightValue: 1.4,
      heightUnit: 'm',
      creatinineValue: 0.6 * 88.4,
      creatinineUnit: 'µmol/L'
    });

    expect(conventional.ok).toBe(true);
    expect(si.ok).toBe(true);
    expect(si.value).toBeCloseTo(conventional.value, 12);
    expect(si.details.heightM).toBeCloseTo(1.4, 13);
    expect(si.details.creatinineMgDl).toBeCloseTo(0.6, 13);
  });

  it('blokuje wynik, gdy brakuje dowolnego markera lub jego standaryzacji', () => {
    expect(extended.computeCkidU25CrCys({
      ...combinedInput,
      creatinineValue: ''
    })).toMatchObject({
      ok: false,
      code: 'CREATININE_VALUE_INVALID',
      field: 'creatinineValue'
    });
    expect(extended.computeCkidU25CrCys({
      ...combinedInput,
      creatinineStandardization: 'Jaffe'
    })).toMatchObject({
      ok: false,
      code: 'CREATININE_STANDARDIZATION_REQUIRED'
    });
    expect(extended.computeCkidU25CrCys({
      ...combinedInput,
      cystatinCValue: null
    })).toMatchObject({
      ok: false,
      code: 'CYSTATIN_C_VALUE_INVALID',
      field: 'cystatinCValue'
    });
  });

  it('egzekwuje granice 1 i 26 lat także dla wyniku średniego', () => {
    expect(extended.computeCkidU25CrCys({
      ...combinedInput,
      ageYears: 1
    }).ok).toBe(true);
    expect(extended.computeCkidU25CrCys({
      ...combinedInput,
      ageYears: 25.999999
    }).ok).toBe(true);
    expect(extended.computeCkidU25CrCys({
      ...combinedInput,
      ageYears: 26
    })).toMatchObject({
      ok: false,
      code: 'AGE_OUT_OF_RANGE'
    });
  });
});
