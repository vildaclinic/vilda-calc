import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

// Realny produkcyjny generator (UMD) — wywołujemy rzeczywisty kod, nie kopię (AGENTS.md §3.5).
const requireCjs = createRequire(import.meta.url);
const epicrisis = requireCjs(path.join(repositoryRoot, 'vilda_epicrisis.js'));
const gen = (metrics, form) => epicrisis.generate(metrics, form).text;

describe('epikryza — spójność testów GH z rozpoznaniem KOWD', () => {
  it('oba szczyty <10 ng/mL: bez zdania o prawidłowym wydzielaniu, z ostrzeżeniem o weryfikacji', () => {
    const t = gen({ sex: 'M', ageYears: 13, ageMonths: 0 }, {
      diagnosis: 'kowd',
      ghTests: { performed: 'yes', context: 'both', test1: { type: 'clonidine', peakGh: 6.2 }, test2: { type: 'glucagon', peakGh: 4.8 } }
    });
    expect(t).not.toContain('mieści się w granicach normy');
    expect(t).toContain('nie potwierdzają prawidłowego wydzielania hormonu wzrostu — rozpoznanie KOWD wymaga weryfikacji w kierunku somatotropinowej niedoczynności przysadki');
  });

  it('brak testów: żadnego twierdzenia o wydzielaniu GH, obserwacja auksometryczna zostaje', () => {
    const t = gen({ sex: 'F', ageYears: 12, ageMonths: 0 }, { diagnosis: 'kowd' });
    expect(t).not.toContain('Wydzielanie hormonu wzrostu');
    expect(t).not.toContain('nie potwierdzają');
    expect(t).toContain('Zalecana obserwacja auksometryczna za 6 miesięcy.');
  });

  it('co najmniej jeden szczyt ≥10: zdanie o prawidłowym wydzielaniu zostaje', () => {
    const t = gen({ sex: 'M', ageYears: 13, ageMonths: 0 }, {
      diagnosis: 'kowd',
      ghTests: { performed: 'yes', context: 'both', test1: { type: 'clonidine', peakGh: 12 }, test2: { type: 'glucagon', peakGh: 8 } }
    });
    expect(t).toContain('Wydzielanie hormonu wzrostu mieści się w granicach normy.');
  });
});

describe('epikryza — spójność testów GH z rozpoznaniem ISS', () => {
  it('szczyty <10: bez „potwierdzeniu prawidłowego wydzielania”, z ostrzeżeniem', () => {
    const t = gen({ sex: 'M', ageYears: 10, ageMonths: 0 }, {
      diagnosis: 'iss',
      ghTests: { performed: 'yes', context: 'both', test1: { type: 'clonidine', peakGh: 3.2 }, test2: { type: 'glucagon', peakGh: 4.1 } }
    });
    expect(t).not.toContain('potwierdzeniu prawidłowego wydzielania');
    expect(t).toContain('rozpoznanie niskorosłości idiopatycznej wymaga weryfikacji');
  });

  it('szczyt ≥10: potwierdzenie prawidłowego wydzielania zostaje', () => {
    const t = gen({ sex: 'M', ageYears: 10, ageMonths: 0 }, {
      diagnosis: 'iss',
      ghTests: { performed: 'yes', context: 'both', test1: { type: 'clonidine', peakGh: 12 }, test2: { type: 'glucagon', peakGh: 11 } }
    });
    expect(t).toContain('i potwierdzeniu prawidłowego wydzielania hormonu wzrostu');
  });

  it('performed=yes bez wpisanych szczytów: bez twierdzenia o wydzielaniu (dawny fałszywy dodatek)', () => {
    const t = gen({ sex: 'M', ageYears: 10, ageMonths: 0 }, {
      diagnosis: 'iss',
      ghTests: { performed: 'yes', context: 'both' }
    });
    expect(t).not.toContain('potwierdzeniu prawidłowego wydzielania');
    expect(t).not.toContain('wymaga weryfikacji');
  });
});

describe('epikryza — wspólne progi hSDS−mpSDS (sekcja auksologiczna vs ISS)', () => {
  const base = { sex: 'M', ageYears: 10, ageMonths: 0, motherHeight: 160, fatherHeight: 175, mph: 174 };

  it('−0,72: „w granicach potencjału” i BEZ zdania ISS o potencjale (dawna sprzeczność)', () => {
    const t = gen({ ...base, hSdsMpSds: -0.72 }, { diagnosis: 'iss' });
    expect(t).toContain('rośnie w granicach swojego potencjału');
    expect(t).not.toContain('wyraźnie poniżej oczekiwanego');
    expect(t).not.toContain('na granicy oczekiwanego');
  });

  it('−1,70: „na granicy” w obu miejscach, minus typograficzny U+2212 w ISS', () => {
    const t = gen({ ...base, hSdsMpSds: -1.7 }, { diagnosis: 'iss' });
    expect(t).toContain('rośnie na granicy swojego potencjału');
    expect(t).toContain('znajduje się na granicy oczekiwanego potencjału genetycznego (hSDS − mpSDS = −1,70)');
  });

  it('−2,30: „poniżej” i „wyraźnie poniżej” spójnie', () => {
    const t = gen({ ...base, hSdsMpSds: -2.3 }, { diagnosis: 'iss' });
    expect(t).toContain('rośnie poniżej swojego potencjału');
    expect(t).toContain('wyraźnie poniżej oczekiwanego potencjału genetycznego (hSDS − mpSDS = −2,30)');
  });
});

describe('epikryza — testy GH: kontekst second_only wnioskuje z obu testów', () => {
  it('1. test 12 / 2. test 8: prawidłowe wydzielanie (nie „oba poniżej normy”), GHD wykluczone', () => {
    const t = gen({ sex: 'M', ageYears: 12, ageMonths: 0 }, {
      diagnosis: 'ghd',
      ghTests: { performed: 'yes', context: 'second_only', test1: { type: 'clonidine', peakGh: '12' }, test2: { type: 'glucagon', peakGh: '8' } }
    });
    expect(t).not.toContain('Oba wyniki poniżej normy');
    expect(t).toContain('w co najmniej jednym teście wskazuje na prawidłowe wydzielanie');
    expect(t).toContain('wykluczono niedobór hormonu wzrostu');
  });

  it('1. test 7 / 2. test 8: potwierdzony niedobór (regresja)', () => {
    const t = gen({ sex: 'M', ageYears: 12, ageMonths: 0 }, {
      diagnosis: 'ghd',
      ghTests: { performed: 'yes', context: 'second_only', test1: { type: 'clonidine', peakGh: '7' }, test2: { type: 'glucagon', peakGh: '8' } }
    });
    expect(t).toContain('Oba wyniki poniżej normy, co potwierdza niedobór');
    expect(t).toContain('odpowiadają niedoborowi hormonu wzrostu');
  });
});

describe('epikryza — testy GH: kontekst both z jednym wypełnionym testem', () => {
  it('tylko test 2 (5,1): sekcja testów obecna, status oczekujący z zaleceniem drugiego testu', () => {
    const t = gen({ sex: 'M', ageYears: 12, ageMonths: 0 }, {
      diagnosis: 'ghd',
      ghTests: { performed: 'yes', context: 'both', test2: { type: 'glucagon', peakGh: 5.1 } }
    });
    expect(t).toContain('szczytowe stężenie GH 5,1 ng/mL');
    expect(t).toContain('konieczne jest uzupełnienie diagnostyki o drugi test');
    expect(t).toContain('wynik wykonanego testu stymulacyjnego (szczyt GH 5,1 ng/mL) jest poniżej normy i wymaga potwierdzenia w drugim teście');
    expect(t).not.toContain('odpowiadają niedoborowi');
  });

  it('tylko test 1 (7): status oczekujący zamiast potwierdzonego niedoboru', () => {
    const t = gen({ sex: 'M', ageYears: 12, ageMonths: 0 }, {
      diagnosis: 'ghd',
      ghTests: { performed: 'yes', context: 'both', test1: { type: 'clonidine', peakGh: 7 } }
    });
    expect(t).toContain('konieczne jest uzupełnienie diagnostyki o drugi test');
    expect(t).toContain('wynik pierwszego testu stymulacyjnego (szczyt GH 7,0 ng/mL) jest poniżej normy');
    expect(t).not.toContain('odpowiadają niedoborowi');
  });

  it('oba testy <10: potwierdzone rozpoznanie (regresja)', () => {
    const t = gen({ sex: 'M', ageYears: 12, ageMonths: 0 }, {
      diagnosis: 'ghd',
      ghTests: { performed: 'yes', context: 'both', test1: { type: 'clonidine', peakGh: 6 }, test2: { type: 'glucagon', peakGh: 7 } }
    });
    expect(t).toContain('rozpoznano niedobór hormonu wzrostu (szczyt GH poniżej 10 ng/mL w obydwu testach');
  });

  it('first_only: ścieżki ≥10 i <10 bez zmian (regresja)', () => {
    const ok = gen({ sex: 'M', ageYears: 10, ageMonths: 0 }, {
      diagnosis: 'ghd',
      ghTests: { performed: 'yes', context: 'first_only', test1: { type: 'clonidine', peakGh: 12 } }
    });
    expect(ok).toContain('co wskazuje na prawidłowe wydzielanie');
    expect(ok).toContain('wykluczono niedobór');
    const pending = gen({ sex: 'M', ageYears: 10, ageMonths: 0 }, {
      diagnosis: 'ghd',
      ghTests: { performed: 'yes', context: 'first_only', test1: { type: 'clonidine', peakGh: 7 } }
    });
    expect(pending).toContain('konieczne jest uzupełnienie diagnostyki o drugi test');
    expect(pending).toContain('wymaga potwierdzenia w drugim teście');
  });
});

describe('epikryza — SGA respektuje wywiad o nadgonieniu wzrostu', () => {
  it('catchUp=yes: bez „bez nadgonienia”, z notą o weryfikacji, bez rekomendacji B.64', () => {
    const t = gen({ sex: 'M', ageYears: 6, ageMonths: 0 }, {
      diagnosis: 'sga',
      birth: { birthWeightG: 2100, birthWeightSds: -2.5, catchUp: 'yes' }
    });
    expect(t).not.toContain('(SGA) bez nadgonienia');
    expect(t).toContain('rozpoznanie niskorosłości na tle SGA wymaga weryfikacji');
    expect(t).not.toContain('B.64');
  });

  it('catchUp=no: dotychczasowa treść i rekomendacja B.64 (regresja)', () => {
    const t = gen({ sex: 'M', ageYears: 6, ageMonths: 0 }, {
      diagnosis: 'sga',
      birth: { birthWeightG: 2100, birthWeightSds: -2.5, catchUp: 'no' }
    });
    expect(t).toContain('(SGA) bez nadgonienia wzrostu do 4. roku życia.');
    expect(t).toContain('B.64');
  });

  it('dopisek SGA przy prawidłowych testach GH zostaje (regresja)', () => {
    const t = gen({ sex: 'M', ageYears: 6, ageMonths: 0 }, {
      diagnosis: 'sga',
      birth: { birthWeightG: 2100, birthWeightSds: -2.5, catchUp: 'no' },
      ghTests: { performed: 'yes', context: 'both', test1: { type: 'clonidine', peakGh: 12 }, test2: { type: 'glucagon', peakGh: 11 } }
    });
    expect(t).toContain('nie zamyka drogi do leczenia hormonem wzrostu');
  });
});

describe('epikryza — otyłość: progi jak w aplikacji i rozpoznanie z obu kryteriów', () => {
  it('Cole 118% + BMI 98. centyl: rozpoznanie otyłości (cięższe kryterium), nie nadwagi', () => {
    const t = gen(
      { sex: 'M', ageYears: 12, ageMonths: 1, height: 150, weight: 60, bmi: 26.7, bmiPercentile: 98, coleIndex: 118 },
      { diagnosis: 'obesity' }
    );
    expect(t).toContain('Na podstawie centyla BMI (98. centyla) rozpoznano otyłość prostą');
    expect(t).not.toContain('rozpoznano nadwagę');
  });

  it('zdanie o farmakoterapii: od 12 lat przy rozpoznanej otyłości, bez błędnego numeru B.130', () => {
    const t12 = gen(
      { sex: 'M', ageYears: 12, ageMonths: 1, bmi: 26.7, bmiPercentile: 98, coleIndex: 118 },
      { diagnosis: 'obesity' }
    );
    expect(t12).toContain('kryteria rozważenia farmakoterapii otyłości');
    expect(t12).not.toContain('B.130');
    const t11 = gen(
      { sex: 'M', ageYears: 11, ageMonths: 0, bmi: 26.7, bmiPercentile: 98, coleIndex: 118 },
      { diagnosis: 'obesity' }
    );
    expect(t11).not.toContain('farmakoterapii otyłości');
    const nadwaga12 = gen(
      { sex: 'M', ageYears: 13, ageMonths: 0, bmi: 24, bmiPercentile: 92, coleIndex: 115 },
      { diagnosis: 'obesity' }
    );
    expect(nadwaga12).toContain('rozpoznano nadwagę');
    expect(nadwaga12).not.toContain('farmakoterapii otyłości');
  });

  it('nadwaga od 85. centyla BMI (jak w klasyfikacji aplikacji, dawniej od 90.)', () => {
    const t = gen({ sex: 'M', ageYears: 11, ageMonths: 0, bmi: 21, bmiPercentile: 85 }, { diagnosis: 'obesity' });
    expect(t).toContain('rozpoznano nadwagę');
    const norm = gen({ sex: 'M', ageYears: 11, ageMonths: 0, bmi: 19, bmiPercentile: 60 }, { diagnosis: 'obesity' });
    expect(norm).toContain('BMI na 60. centylu.');
  });

  it('obie podstawy nadwagi wymienione, pisownia „wskaźnika Cole\'a”', () => {
    const t = gen(
      { sex: 'M', ageYears: 11, ageMonths: 0, height: 150, weight: 50, bmi: 22.2, bmiPercentile: 86, coleIndex: 118 },
      { diagnosis: 'obesity' }
    );
    expect(t).toContain("wskaźnika Cole'a (118%)");
    expect(t).toContain('centyla BMI (86. centyla)');
    expect(t).toContain('rozpoznano nadwagę');
    expect(t).not.toContain('Colea');
  });

  it('otyłość olbrzymia wyłącznie ze standaryzowanego BMI (Z ≥ +3), nie z Cole ≥150', () => {
    const olbrzymia = gen(
      { sex: 'M', ageYears: 13, ageMonths: 0, bmi: 35, bmiPercentile: 99.5, bmiSds: 3.4, coleIndex: 160 },
      { diagnosis: 'obesity' }
    );
    expect(olbrzymia).toContain('rozpoznano otyłość olbrzymią');
    const cole160 = gen({ sex: 'M', ageYears: 13, ageMonths: 0, bmi: 35, coleIndex: 160 }, { diagnosis: 'obesity' });
    expect(cole160).toContain("wskaźnika Cole'a (160%) rozpoznano otyłość prostą");
    expect(cole160).not.toContain('olbrzymią');
  });

  it('Cole równy 110%: bez rozpoznania nadwagi (próg >110, jak w vilda_update_prep)', () => {
    const t = gen({ sex: 'M', ageYears: 9, ageMonths: 0, bmi: 19, coleIndex: 110 }, { diagnosis: 'obesity' });
    expect(t).toContain("Wskaźnik Cole'a wynosi 110%");
    expect(t).not.toContain('nadwag');
  });
});

describe('epikryza — tempo wzrastania: trzy stany zamiast fałszywego „w normie”', () => {
  it('flaga null (oceny nie przeprowadzono): zdanie bez odniesienia do normy', () => {
    const t = gen(
      { sex: 'F', ageYears: 13, ageMonths: 6, growthVelocity: 3.0, growthVelocityMonths: 12, growthVelocityLow: null },
      {}
    );
    expect(t).toContain('Aktualne tempo wzrastania wynosi 3,0 cm/rok (z 12-miesięcznej obserwacji).');
    expect(t).not.toContain('w normie');
    expect(t).not.toContain('poniżej normy');
  });

  it('flaga true/false: dotychczasowe frazy (regresja)', () => {
    const low = gen(
      { sex: 'F', ageYears: 8, ageMonths: 0, growthVelocity: 4.0, growthVelocityMonths: 12, growthVelocityLow: true },
      {}
    );
    expect(low).toContain('i jest poniżej normy dla wieku');
    const ok = gen(
      { sex: 'F', ageYears: 8, ageMonths: 0, growthVelocity: 6.0, growthVelocityMonths: 12, growthVelocityLow: false },
      {}
    );
    expect(ok).toContain('i jest w normie dla wieku');
  });
});

describe('epikryza — kolektor UI liczy flagę tempa hierarchią modułu trajektorii', () => {
  const uiSource = fs.readFileSync(path.join(repositoryRoot, 'vilda_epicrisis_ui.js'), 'utf8');

  it('wywołuje VildaTrajectoryAnalysis.assessVelocityValue z kontekstem Tanner/wiek kostny', () => {
    expect(uiSource).toContain('assessVelocityValue');
    expect(uiSource).toContain('tannerStage:e.tannerStage');
    expect(uiSource).toContain('baMonths:e.boneAgeMonths');
  });

  it('stan „nieoceniono” (null) gdy brak okna rocznego lub normy; stary próg tylko jako fallback bez modułu', () => {
    expect(uiSource).toContain('Va9.usedLastYear&&Va9.normLabel?!!Va9.slow:null');
    expect(uiSource).toContain('ye!=null&&i>=4&&i<=12&&(ve=ye<4.5)');
  });
});
