import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function loadStoneSafety() {
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../..'
  );
  const source = fs.readFileSync(
    path.join(repositoryRoot, 'clcr_stone_safety.js'),
    'utf8'
  );
  const browserGlobal = {};
  const execute = new Function('window', 'globalThis', source);
  execute(browserGlobal, browserGlobal);
  return browserGlobal.ClcrStoneSafety;
}

describe('Klirens — izolowany moduł bezpieczeństwa kamicy', () => {
  const stone = loadStoneSafety();

  it('eksportuje zamrożone API UMD i wersjonowane źródło', () => {
    expect(Object.isFrozen(stone)).toBe(true);
    expect(stone.SOURCE).toMatchObject({
      id: 'EAU_UROLITHIASIS_2026'
    });
    expect(stone.SOURCE.url).toContain('EAU-Guidelines-on-Urolithiasis-2026.pdf');
  });

  it('utrzymuje jawne masy molowe dla P, PO4 i dwóch konwencji szczawianu', () => {
    expect(stone.MOLAR_MASS_MG_PER_MMOL).toMatchObject({
      calcium: 40.078,
      magnesium: 24.305,
      phosphorus: 30.973761998,
      phosphate: 94.9714,
      oxalicAcid: 90.0349,
      oxalateIon: 88.019,
      cystine: 240.3005
    });
  });
});

describe('Klirens — konwersje kompletnej czasowej zbiórki moczu', () => {
  const stone = loadStoneSafety();

  it('normalizuje 12-godzinną zbiórkę do 24 h z rzeczywistego czasu', () => {
    const result = stone.convertDzmAnalyte({
      analyte: 'calcium',
      concentration: 10,
      concentrationUnit: 'mg/dL',
      collectedVolumeMl: 600,
      durationMinutes: 720,
      collectionComplete: true
    });

    expect(result).toMatchObject({
      ok: true,
      normalisationFactor: 2,
      normalisedVolumeMl24: 1200,
      actualMg: 60,
      totalMg24: 120
    });
    expect(result.totalMmol24).toBeCloseTo(120 / 40.078, 12);
    expect(result.message).toContain('rzeczywistego czasu');
  });

  it('daje ten sam wynik wapnia dla mg/dL, mg/L i mmol/L', () => {
    const common = {
      analyte: 'calcium',
      collectedVolumeMl: 1000,
      durationMinutes: 1440,
      collectionComplete: true
    };
    const fromMgDl = stone.convertDzmAnalyte({
      ...common,
      concentration: 4.0078,
      concentrationUnit: 'mg/dL'
    });
    const fromMgL = stone.convertDzmAnalyte({
      ...common,
      concentration: 40.078,
      concentrationUnit: 'mg/L'
    });
    const fromMmol = stone.convertDzmAnalyte({
      ...common,
      concentration: 1,
      concentrationUnit: 'mmol/L'
    });

    for (const result of [fromMgDl, fromMgL, fromMmol]) {
      expect(result.ok).toBe(true);
      expect(result.totalMg24).toBeCloseTo(40.078, 12);
      expect(result.totalMmol24).toBeCloseTo(1, 12);
    }
  });

  it('traktuje zerowe stężenie jako wynik, a nie brak danych', () => {
    expect(stone.convertDzmAnalyte({
      analyte: 'uricAcid',
      concentration: 0,
      concentrationUnit: 'mg/L',
      collectedVolumeMl: 1500,
      durationMinutes: 1440,
      collectionComplete: true
    })).toMatchObject({
      ok: true,
      totalMg24: 0,
      totalMmol24: 0
    });
  });

  it('twardo blokuje niepełną zbiórkę, brak czasu i objętości', () => {
    const base = {
      analyte: 'calcium',
      concentration: 5,
      concentrationUnit: 'mmol/L',
      collectedVolumeMl: 1000,
      durationMinutes: 1440
    };
    expect(stone.convertDzmAnalyte(base)).toMatchObject({
      ok: false,
      code: 'incompleteCollection'
    });
    expect(stone.convertDzmAnalyte({
      ...base,
      collectionComplete: true,
      durationMinutes: 0
    })).toMatchObject({ ok: false, code: 'invalidDuration' });
    expect(stone.convertDzmAnalyte({
      ...base,
      collectionComplete: true,
      collectedVolumeMl: 0
    })).toMatchObject({ ok: false, code: 'invalidVolume' });
  });

  it('odrzuca ujemne stężenie i jednostkę inną niż jawnie obsługiwane', () => {
    const base = {
      analyte: 'calcium',
      collectedVolumeMl: 1000,
      durationMinutes: 1440,
      collectionComplete: true
    };
    expect(stone.convertDzmAnalyte({
      ...base,
      concentration: -0.1,
      concentrationUnit: 'mmol/L'
    })).toMatchObject({ ok: false, code: 'invalidConcentration' });
    expect(stone.convertDzmAnalyte({
      ...base,
      concentration: 1,
      concentrationUnit: 'mg/24 h'
    })).toMatchObject({ ok: false, code: 'unsupportedUnit' });
  });

  it('wymaga reportingEntity dla szczawianu i rozróżnia obie masy', () => {
    const base = {
      analyte: 'oxalate',
      concentrationUnit: 'mg/L',
      collectedVolumeMl: 1000,
      durationMinutes: 1440,
      collectionComplete: true
    };
    expect(stone.convertDzmAnalyte({
      ...base,
      concentration: 90.0349
    })).toMatchObject({
      ok: false,
      code: 'reportingEntityRequired'
    });
    expect(stone.convertDzmAnalyte({
      ...base,
      reportingEntity: 'oxalicAcid',
      concentration: 90.0349
    })).toMatchObject({
      ok: true,
      reportingEntity: 'oxalicAcid',
      totalMmol24: 1
    });
    expect(stone.convertDzmAnalyte({
      ...base,
      reportingEntity: 'oxalateIon',
      concentration: 88.019
    })).toMatchObject({
      ok: true,
      reportingEntity: 'oxalateIon',
      totalMmol24: 1
    });
  });

  it('nie miesza masy fosforu P z masą jonu PO4', () => {
    const base = {
      concentrationUnit: 'mg/L',
      collectedVolumeMl: 1000,
      durationMinutes: 1440,
      collectionComplete: true
    };
    const phosphorus = stone.convertDzmAnalyte({
      ...base,
      analyte: 'inorganicPhosphorus',
      concentration: 30.973761998
    });
    const phosphate = stone.convertDzmAnalyte({
      ...base,
      analyte: 'phosphate',
      concentration: 94.9714
    });

    expect(phosphorus).toMatchObject({
      ok: true,
      reportingEntity: 'phosphorus',
      totalMmol24: 1
    });
    expect(phosphate).toMatchObject({
      ok: true,
      reportingEntity: 'phosphate',
      totalMmol24: 1
    });
    expect(phosphorus.totalMg24).not.toBe(phosphate.totalMg24);
  });

  it('przelicza cytrynian i cystynę według jawnych konwencji masowych', () => {
    const base = {
      concentrationUnit: 'mg/L',
      collectedVolumeMl: 1000,
      durationMinutes: 1440,
      collectionComplete: true
    };
    expect(stone.convertDzmAnalyte({
      ...base,
      analyte: 'citrate',
      concentration: 192.1235
    })).toMatchObject({
      ok: true,
      reportingEntity: 'citricAcid',
      totalMmol24: 1
    });
    expect(stone.convertDzmAnalyte({
      ...base,
      analyte: 'cystine',
      concentration: 30.0375625
    }).totalMmol24).toBeCloseTo(0.125, 12);
  });
});

describe('Klirens — progi kamicy u dorosłych', () => {
  const stone = loadStoneSafety();

  it('zachowuje ścisłe progi >5 i >8 mmol/24 h dla wapnia', () => {
    expect(stone.interpretAdultCalcium({ mmol24: 5 }).code)
      .toBe('notAboveCalciumAttentionLimit');
    expect(stone.interpretAdultCalcium({ mmol24: 5.000001 }).code)
      .toBe('aboveCalciumAttentionLimit');
    expect(stone.interpretAdultCalcium({ mmol24: 8 }).code)
      .toBe('aboveCalciumAttentionLimit');
    expect(stone.interpretAdultCalcium({ mmol24: 8.000001 }).code)
      .toBe('aboveHighCalciumLimit');
  });

  it('zachowuje ścisły dolny próg <3 mmol/24 h dla magnezu', () => {
    expect(stone.interpretAdultMagnesium({ mmol24: 2.999999 }).code)
      .toBe('belowMagnesiumLimit');
    expect(stone.interpretAdultMagnesium({ mmol24: 3 }).code)
      .toBe('notBelowMagnesiumLimit');
  });

  it('wymaga płci dla kwasu moczowego i stosuje osobne progi', () => {
    expect(stone.interpretAdultUricAcid({ mmol24: 4.1 })).toMatchObject({
      ok: false,
      code: 'sexRequired'
    });
    expect(stone.interpretAdultUricAcid({ mmol24: 4, sex: 'F' }).code)
      .toBe('notAboveUricAcidLimit');
    const femaleHigh = stone.interpretAdultUricAcid({
      mmol24: 4.000001,
      sex: 'F'
    });
    expect(femaleHigh.code).toBe('aboveUricAcidLimit');
    expect(femaleHigh.message).toContain('4,0 mmol/24 h');
    expect(stone.interpretAdultUricAcid({ mmol24: 5, sex: 'M' }).code)
      .toBe('notAboveUricAcidLimit');
    expect(stone.interpretAdultUricAcid({ mmol24: 5.000001, sex: 'M' }).code)
      .toBe('aboveUricAcidLimit');
  });

  it('wymaga płci dla cytrynianu i stosuje dolne progi K/M', () => {
    expect(stone.interpretAdultCitrate({ mmol24: 2 })).toMatchObject({
      ok: false,
      code: 'sexRequired'
    });
    const femaleLow = stone.interpretAdultCitrate({
      mmol24: 1.899999,
      sex: 'F'
    });
    expect(femaleLow.code).toBe('belowCitrateLimit');
    expect(femaleLow.message).toContain('1,9 mmol/24 h');
    expect(stone.interpretAdultCitrate({ mmol24: 1.9, sex: 'F' }).code)
      .toBe('notBelowCitrateLimit');
    expect(stone.interpretAdultCitrate({ mmol24: 1.699999, sex: 'M' }).code)
      .toBe('belowCitrateLimit');
    expect(stone.interpretAdultCitrate({ mmol24: 1.7, sex: 'M' }).code)
      .toBe('notBelowCitrateLimit');
  });

  it('nie interpretuje szczawianu bez reportingEntity', () => {
    expect(stone.interpretAdultOxalate({ mmol24: 0.3 })).toMatchObject({
      ok: false,
      code: 'reportingEntityRequired'
    });
  });

  it('zachowuje wszystkie ścisłe granice szczawianu', () => {
    const assess = (mmol24) => stone.interpretAdultOxalate({
      mmol24,
      reportingEntity: 'oxalicAcid'
    }).code;

    expect(assess(0.4)).toBe('notAboveOxalateLimit');
    expect(assess(0.400001)).toBe('mildOxalateElevation');
    expect(assess(0.5)).toBe('mildOxalateElevation');
    expect(assess(0.500001)).toBe('aboveEntericOxalateAttentionLimit');
    expect(assess(1)).toBe('aboveEntericOxalateAttentionLimit');
    expect(assess(1.000001)).toBe('abovePrimaryOxalateAttentionLimit');
  });

  it('zachowuje ścisły próg >35 mmol/24 h dla P_i', () => {
    expect(stone.interpretAdultInorganicPhosphorus({ mmol24: 35 }).code)
      .toBe('notAboveInorganicPhosphorusLimit');
    expect(stone.interpretAdultInorganicPhosphorus({ mmol24: 35.000001 }).code)
      .toBe('aboveInorganicPhosphorusLimit');
  });

  it('rozdziela próg nieprawidłowej cystyny od progu rozważania leczenia', () => {
    expect(stone.interpretAdultCystine({ mmol24: 0.125 }).code)
      .toBe('notAboveCystineAbnormalLimit');
    expect(stone.interpretAdultCystine({ mmol24: 0.125001 }).code)
      .toBe('aboveCystineAbnormalLimit');
    expect(stone.interpretAdultCystine({ mmol24: 2.999999 }).code)
      .toBe('aboveCystineAbnormalLimit');
    expect(stone.interpretAdultCystine({ mmol24: 3 }).code)
      .toBe('atCystineTreatmentConsiderationLimit');
  });

  it('wstrzymuje rutynową interpretację cystyny podczas terapii tiolowej', () => {
    expect(stone.interpretAdultCystine({
      mmol24: 4,
      thiolTherapy: true
    })).toMatchObject({
      ok: false,
      code: 'thiolTherapyLimitsAssay'
    });
  });

  it('w rozpoznanej cystynurii nie stosuje diagnostycznego progu przesiewowego', () => {
    expect(stone.interpretAdultCystine({
      mmol24: 0.2,
      knownCystinuria: true
    })).toMatchObject({
      ok: true,
      status: 'contextOnly',
      code: 'knownCystinuriaScreeningLimitNotApplied'
    });
    expect(stone.interpretAdultCystine({
      mmol24: 3,
      knownCystinuria: true
    }).code).toBe('atCystineTreatmentConsiderationLimit');
  });

  it('traktuje objętość jako cel prewencyjny, nie laboratoryjną normę', () => {
    expect(stone.interpretAdultUrineVolume({
      volumeL24: 2.5
    }).code).toBe('urineVolumeGoalNotMet');
    expect(stone.interpretAdultUrineVolume({
      volumeL24: 2.500001
    }).code).toBe('urineVolumeGoalMet');
    expect(stone.interpretAdultUrineVolume({
      volumeL24: 3,
      context: 'cystinuria'
    }).code).toBe('urineVolumeGoalNotMet');
    expect(stone.interpretAdultUrineVolume({
      volumeL24: 3.000001,
      context: 'cystinuria'
    }).code).toBe('urineVolumeGoalMet');
  });

  it('nie nazywa pośredniego pH uniwersalną normą', () => {
    expect(stone.interpretAdultDzmPh({ ph: 5.5 }).code)
      .toBe('noUniversalPhCategory');
    expect(stone.interpretAdultDzmPh({ ph: 6.2 }).code)
      .toBe('noUniversalPhCategory');
  });

  it('rozpoznaje wyłącznie wzorce kontekstowe pH, bez stawiania rozpoznania', () => {
    expect(stone.interpretAdultDzmPh({
      ph: 5.4999,
      persistentAbnormalPh: true
    }).code)
      .toBe('hyperacidicUrinePattern');
    expect(stone.interpretAdultDzmPh({
      ph: 6.21,
      persistentAbnormalPh: true
    }).code)
      .toBe('rtaScreenIncomplete');
    expect(stone.interpretAdultDzmPh({
      ph: 6.21,
      fastingSecondMorningSpotPh: 5.8,
      infectionExcluded: true,
      persistentAbnormalPh: true
    }).code).toBe('rtaScreenIncomplete');
    const pattern = stone.interpretAdultDzmPh({
      ph: 6.21,
      fastingSecondMorningSpotPh: 5.81,
      infectionExcluded: true,
      persistentAbnormalPh: true
    });
    expect(pattern.code).toBe('rtaScreenPatternPresent');
    expect(pattern.message).toContain('Nie jest to rozpoznanie');
    expect(stone.interpretAdultDzmPh({
      ph: 7.01,
      persistentAbnormalPh: true
    }).code)
      .toBe('alkalineUrineCheckInfection');
  });

  it('bez powtarzanych pomiarów pokazuje pH bez klasyfikacji progiem', () => {
    expect(stone.interpretAdultDzmPh({ ph: 5.4 })).toMatchObject({
      status: 'contextOnly',
      code: 'phPatternNotRepeated'
    });
    expect(stone.interpretAdultDzmPh({
      ph: 6.3,
      fastingSecondMorningSpotPh: 6,
      infectionExcluded: true
    }).code).toBe('phPatternNotRepeated');
  });

  it('stosuje pH terapii tylko w jawnie wybranym kontekście', () => {
    expect(stone.interpretAdultDzmPh({
      ph: 7.5,
      treatmentContext: 'cystinuria',
      persistentAbnormalPh: true
    }).code).toBe('cystinuriaPhGoalNotMet');
    expect(stone.interpretAdultDzmPh({
      ph: 7.500001,
      treatmentContext: 'cystinuria',
      persistentAbnormalPh: true
    }).code).toBe('cystinuriaPhGoalMet');
    expect(stone.interpretAdultDzmPh({
      ph: 7,
      treatmentContext: 'uricAcidChemolysis',
      persistentAbnormalPh: true
    }).code).toBe('uricAcidChemolysisPhTarget');
    expect(stone.interpretAdultDzmPh({
      ph: 7.2,
      treatmentContext: 'uricAcidChemolysis',
      persistentAbnormalPh: true
    }).code).toBe('uricAcidChemolysisPhTarget');
    expect(stone.interpretAdultDzmPh({
      ph: 7.200001,
      treatmentContext: 'uricAcidChemolysis',
      persistentAbnormalPh: true
    }).code).toBe('uricAcidChemolysisPhAboveTarget');
  });

  it('buduje panel bez domyślnego uzupełniania płci lub konwencji Ox', () => {
    const panel = stone.interpretAdultStonePanel({
      calciumMmol24: 6,
      uricAcidMmol24: 4.5,
      oxalateMmol24: 0.6,
      citrateMmol24: 2
    });

    expect(panel.calcium.code).toBe('aboveCalciumAttentionLimit');
    expect(panel.uricAcid.code).toBe('sexRequired');
    expect(panel.oxalate.code).toBe('reportingEntityRequired');
    expect(panel.citrate.code).toBe('sexRequired');
    expect(panel.magnesium).toBeNull();
  });
});

describe('Klirens — bezpieczne progi pediatryczne Ca', () => {
  const stone = loadStoneSafety();

  it('stosuje kanoniczny próg <0,1 mmol/kg/24 h dla Ca w DZM', () => {
    expect(stone.interpretPediatricCalcium24h({
      totalMmol24: 1.999,
      weightKg: 20
    }).code).toBe('belowPediatricCalciumLimit');
    expect(stone.interpretPediatricCalcium24h({
      totalMmol24: 2,
      weightKg: 20
    })).toMatchObject({
      code: 'notBelowPediatricCalciumLimit',
      mmolKg24: 0.1
    });
  });

  it('wymaga aktualnej dodatniej masy do pediatrycznego Ca w DZM', () => {
    expect(stone.interpretPediatricCalcium24h({
      totalMmol24: 1,
      weightKg: 0
    })).toMatchObject({
      ok: false,
      code: 'weightRequired'
    });
  });

  it('wymaga tej samej próbki dla pediatrycznego Ca/Cr', () => {
    expect(stone.interpretPediatricCalciumCreatinineSpot({
      ageYears: 8,
      ageMonths: 0,
      ratioMgMg: 0.1,
      sameSpecimen: false
    })).toMatchObject({
      ok: false,
      code: 'sameSpecimenRequired'
    });
  });

  it.each([1, 3, 5, 7])(
    'wstrzymuje automatyczną kategorię dokładnie na granicy %s lat',
    (ageYears) => {
      const result = stone.interpretPediatricCalciumCreatinineSpot({
        ageYears,
        ageMonths: 0,
        ratioMgMg: 0.1,
        sameSpecimen: true
      });
      expect(result).toMatchObject({
        ok: false,
        code: 'ageBoundaryAmbiguous'
      });
      expect(result.ratioMgMg).toBe(0.1);
    }
  );

  it('nie blokuje pacjenta dzień po granicy, jeśli podano dokładniejszy wiek', () => {
    expect(stone.interpretPediatricCalciumCreatinineSpot({
      ageYears: 1,
      ageMonths: 0,
      ageDays: 1,
      ratioMolMol: 1,
      sameSpecimen: true
    })).toMatchObject({
      ok: true,
      ageBand: 'over1ToUnder3'
    });
  });

  it('wybiera wszystkie bezpieczne przedziały wieku EAU poza granicami', () => {
    const cases = [
      [{ ageYears: 0, ageMonths: 11 }, 'under1', 2.2],
      [{ ageYears: 1, ageMonths: 1 }, 'over1ToUnder3', 1.5],
      [{ ageYears: 3, ageMonths: 1 }, 'over3ToUnder5', 1.1],
      [{ ageYears: 5, ageMonths: 1 }, 'over5ToUnder7', 0.8],
      [{ ageYears: 7, ageMonths: 1 }, 'over7ToUnder18', 0.6]
    ];
    for (const [age, ageBand, upperMolMolExclusive] of cases) {
      expect(stone.interpretPediatricCalciumCreatinineSpot({
        ...age,
        ratioMolMol: 0,
        sameSpecimen: true
      })).toMatchObject({
        ok: true,
        ageBand,
        upperMolMolExclusive
      });
    }
  });

  it('porównuje Ca/Cr kanonicznie w mol/mol i zachowuje ścisłe <', () => {
    const below = stone.interpretPediatricCalciumCreatinineSpot({
      ageYears: 8,
      ageMonths: 0,
      ratioMolMol: 0.599999,
      sameSpecimen: true
    });
    const boundary = stone.interpretPediatricCalciumCreatinineSpot({
      ageYears: 8,
      ageMonths: 0,
      ratioMolMol: 0.6,
      sameSpecimen: true
    });
    expect(below.code).toBe('belowPediatricCacrLimit');
    expect(boundary.code).toBe('notBelowPediatricCacrLimit');
  });

  it('przelicza wejście mg/mg do kanonicznego mol/mol', () => {
    const exactMassEquivalent =
      0.6 * stone.MOLAR_MASS_MG_PER_MMOL.calcium /
      stone.MOLAR_MASS_MG_PER_MMOL.creatinine;
    const result = stone.interpretPediatricCalciumCreatinineSpot({
      ageYears: 8,
      ageMonths: 0,
      ratioMgMg: exactMassEquivalent,
      sameSpecimen: true
    });
    expect(result.ratioMolMol).toBeCloseTo(0.6, 12);
    expect(result.code).toBe('notBelowPediatricCacrLimit');
  });

  it('blokuje wiek dorosły, ujemny stosunek i brak stosunku', () => {
    expect(stone.interpretPediatricCalciumCreatinineSpot({
      ageYears: 18,
      ageMonths: 0,
      ratioMolMol: 0.1,
      sameSpecimen: true
    }).code).toBe('invalidPediatricAge');
    expect(stone.interpretPediatricCalciumCreatinineSpot({
      ageYears: 8,
      ageMonths: 0,
      ratioMolMol: -0.1,
      sameSpecimen: true
    }).code).toBe('invalidCalciumCreatinineRatio');
    expect(stone.interpretPediatricCalciumCreatinineSpot({
      ageYears: 8,
      ageMonths: 0,
      sameSpecimen: true
    }).code).toBe('invalidCalciumCreatinineRatio');
  });
});
