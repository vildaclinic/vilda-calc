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

describe('epikryza P3 — warstwa językowa i formatowanie', () => {
  it('dopełniacz wieku po „w wieku” (lata 1–4, miesiące 1–4, 0 lat)', () => {
    expect(gen({ sex: 'F', ageYears: 4, ageMonths: 3 }, {})).toContain('w wieku 4 lat i 3 miesięcy została');
    expect(gen({ sex: 'M', ageYears: 1, ageMonths: 2 }, {})).toContain('w wieku 1 roku i 2 miesięcy został');
    expect(gen({ sex: 'M', ageYears: 12, ageMonths: 1 }, {})).toContain('w wieku 12 lat i 1 miesiąca');
    expect(gen({ sex: 'F', ageYears: 0, ageMonths: 7 }, {})).toContain('w wieku 7 miesięcy');
    expect(gen({ sex: 'F', ageYears: 5, ageMonths: 0 }, {})).toContain('w wieku 5 lat została');
  });

  it('objętość jąder jako etykieta kliniczna zamiast tokenu selecta', () => {
    const t = gen(
      { sex: 'M', ageYears: 12, ageMonths: 6, height: 140, testicularVolume: 'lt4' },
      { clinical: { tannerGenitalia: 1, tannerPubic: 1 } }
    );
    expect(t).toContain('G1, obj. jąder <4 ml, P1');
    expect(t).not.toContain('lt4');
    const t2 = gen(
      { sex: 'M', ageYears: 12, ageMonths: 6, height: 140, testicularVolume: '4to6' },
      { clinical: { tannerGenitalia: 2, tannerPubic: 2 } }
    );
    expect(t2).toContain('obj. jąder 4–6 ml');
  });

  it('brak wzrostu nie wycieka jako „wzrost null cm”', () => {
    const t = gen({ sex: 'F', ageYears: 5, ageMonths: 0, weight: 18 }, {});
    expect(t).not.toContain('null');
    expect(t).toContain('masa ciała 18 kg');
  });

  it('priming zależny od płci (chłopiec: androgenowy, dziewczynka: estrogenowy)', () => {
    const boy = gen({ sex: 'M', ageYears: 13, ageMonths: 0 }, {
      diagnosis: 'ghd',
      ghTests: { performed: 'yes', context: 'first_only', priming: 'yes', test1: { type: 'clonidine', peakGh: 12 } }
    });
    expect(boy).toContain('Zastosowano priming androgenowy.');
    expect(boy).not.toContain('estrogenowy');
    const girl = gen({ sex: 'F', ageYears: 13, ageMonths: 0 }, {
      diagnosis: 'ghd',
      ghTests: { performed: 'yes', context: 'first_only', priming: 'yes', test1: { type: 'clonidine', peakGh: 12 } }
    });
    expect(girl).toContain('Zastosowano priming estrogenowy.');
  });

  it('wartości laboratoryjne z przecinkiem dziesiętnym i jednostkami (TSH mU/L, fT4 pmol/L, kortyzol, lipidy)', () => {
    const labs = gen({ sex: 'F', ageYears: 9, ageMonths: 0 }, { labs: { thyroidNormal: 'no', tsh: '28.4', ft4: '0.6' } });
    expect(labs).toContain('TSH 28,4 mU/L');
    expect(labs).toContain('fT4 0,6 pmol/L');
    const cort = gen({ sex: 'F', ageYears: 9, ageMonths: 0 }, { labs: { cortisolNormal: 'no', cortisolMorning: '93.5' } });
    expect(cort).toContain('(93,5 nmol/L)');
    const lip = gen(
      { sex: 'M', ageYears: 13, ageMonths: 0, bmi: 32, bmiPercentile: 99 },
      { diagnosis: 'obesity', obesity: { lipidsNormal: 'no', cholTotal: '5.8', ldl: '3.9', hdl: '0.9', triglycerides: '2.1', thyroidNormal: 'no', tsh: '6.2' } }
    );
    expect(lip).toContain('Chol 5,8 mmol/L');
    expect(lip).toContain('TG 2,1 mmol/L');
    expect(lip).toContain('TSH 6,2 mU/L');
  });

  it('niewykonana celiakia jako osobne zdanie, nie w liście po „stwierdzono:”', () => {
    const t = gen({ sex: 'F', ageYears: 9, ageMonths: 0 }, { labs: { celiacNormal: 'not_done', cbcNormal: 'no' } });
    expect(t).toContain('stwierdzono: odchylenia w morfologii krwi. Badania w kierunku celiakii nie wykonano.');
    const solo = gen({ sex: 'F', ageYears: 9, ageMonths: 0 }, { labs: { celiacNormal: 'not_done' } });
    expect(solo).toContain('Badania w kierunku celiakii nie wykonano.');
    expect(solo).not.toContain('stwierdzono:');
  });

  it('wolny tekst wywiadu bez podwójnej kropki', () => {
    const t = gen(
      { sex: 'M', ageYears: 9, ageMonths: 0 },
      { clinical: { chronicDisease: 'yes', chronicDiseases: ['astma'], chronicOther: 'stan po appendektomii.' } }
    );
    expect(t).toContain('stan po appendektomii.');
    expect(t).not.toContain('appendektomii..');
  });

  it('wywiad okołoporodowy bez wiszącego „dziecko urodzone,” przy braku tygodnia ciąży', () => {
    const t = gen({ sex: 'M', ageYears: 6, ageMonths: 0 }, { birth: { birthWeightG: 2100 } });
    expect(t).toContain('Wywiad okołoporodowy: masa urodzeniowa 2100 g.');
    expect(t).not.toContain('urodzone,');
    const withWeeks = gen({ sex: 'M', ageYears: 6, ageMonths: 0 }, { birth: { gestationalWeeks: 38, birthWeightG: 2100 } });
    expect(withWeeks).toContain('dziecko urodzone w 38. tygodniu ciąży, masa urodzeniowa 2100 g');
  });

  it('odmiana wieku kostnego („2,5 roku”, „1 rok”, „3 lata”, „10 lat”)', () => {
    expect(gen({ sex: 'M', ageYears: 9, ageMonths: 0, boneAge: 2.5 }, {})).toContain('oceniono na 2,5 roku');
    expect(gen({ sex: 'M', ageYears: 9, ageMonths: 0, boneAge: 1 }, {})).toContain('oceniono na 1 rok');
    expect(gen({ sex: 'M', ageYears: 9, ageMonths: 0, boneAge: 3 }, {})).toContain('oceniono na 3 lata');
    expect(gen({ sex: 'M', ageYears: 12, ageMonths: 0, boneAge: 10 }, {})).toContain('oceniono na 10 lat');
  });

  it('zakończenie GHD bez odwołania do nieistniejącej sekcji zaleceń', () => {
    const t = gen({ sex: 'M', ageYears: 10, ageMonths: 0 }, {
      diagnosis: 'ghd',
      ghTests: { performed: 'yes', context: 'first_only', test1: { type: 'clonidine', peakGh: 12 } }
    });
    expect(t).toContain('zwolniono do domu z zaleceniami.');
    expect(t).not.toContain('jak niżej');
  });

  it('własny powód hospitalizacji zachowuje akronimy (mała litera tylko na początku)', () => {
    const t = gen({ sex: 'M', ageYears: 10, ageMonths: 0 }, { reasons: ['Kwalifikacji do programu B.19 NFZ'] });
    expect(t).toContain('w celu kwalifikacji do programu B.19 NFZ');
    expect(t).not.toContain('b.19 nfz');
  });

  it('norma testów GH jako „≥10 ng/mL” — spójna ze szczytem równym dokładnie 10,0', () => {
    const t = gen({ sex: 'M', ageYears: 10, ageMonths: 0 }, {
      diagnosis: 'ghd',
      ghTests: { performed: 'yes', context: 'first_only', test1: { type: 'clonidine', peakGh: 10 } }
    });
    expect(t).toContain('(norma ≥10 ng/mL)');
    expect(t).not.toContain('norma powyżej 10');
    expect(t).toContain('prawidłowe wydzielanie');
  });
});

describe('epikryza P4 — prefill kreatora z danych aplikacji i lokalny JSZip', () => {
  const uiSource = fs.readFileSync(path.join(repositoryRoot, 'vilda_epicrisis_ui.js'), 'utf8');

  it('seeduje wywiad rodzinny KOWD z karty zaawansowanej (yes/no, unknown pomijane)', () => {
    expect(uiSource).toContain('f9=e9.familyDelayedPuberty;(f9==="yes"||f9==="no")&&(y.answers.familyDelayedPuberty=f9)');
  });

  it('seeduje Tanner z formularza głównego (#tannerStage) do właściwego pola wg płci', () => {
    expect(uiSource).toContain('document.getElementById("tannerStage")');
    expect(uiSource).toContain('y.pd&&y.pd.sex==="M"?y.answers.clinical.tannerGenitalia=String(v9):y.answers.clinical.tannerBreasts=String(v9)');
  });

  it('seeduje choroby przewlekłe z pola wykluczeń karty (growthExclusion)', () => {
    expect(uiSource).toContain('g9=e9.growthExclusion;(g9==="yes"||g9==="no")');
    expect(uiSource).toContain('y.answers.clinical.chronicDisease=g9');
  });

  it('dane urodzeniowe z karty SGA tylko jako fallback, gdy brak snapshotu Vault', () => {
    expect(uiSource).toContain('if(!y.answers.birth){');
    expect(uiSource).toContain('w9("sgaBirthWeeks")');
    expect(uiSource).toContain('w9("sgaBirthWeight")');
    expect(uiSource).toContain('input[name="sgaBirthSource"]:checked');
    expect(uiSource).toContain('(b9.birthWeightG!=null||b9.birthLengthCm!=null)&&(y.answers.birth=b9)');
  });

  it('JSZip ładowany lokalnie (offline PWA) z fallbackiem do CDN', () => {
    expect(uiSource).toContain('var He="jszip.min.js?v=1"');
    expect(uiSource).toContain('Ne9="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"');
    const jszip = fs.readFileSync(path.join(repositoryRoot, 'jszip.min.js'), 'utf8');
    expect(jszip).toContain('JSZip v3.10.1');
    const sw = fs.readFileSync(path.join(repositoryRoot, 'service-worker-kalorii.js'), 'utf8');
    expect(sw).toContain("'/jszip.min.js?v=1',");
  });
});

describe('epikryza etap 2 — zasilenie danymi analizy trajektorii', () => {
  const trajDecel = {
    height: {
      fromAgeM: 48, toAgeM: 84,
      total: { label: 'istotna deceleracja wzrastania', tone: 'bad' },
      worst: { fromAgeM: 60, toAgeM: 72, dSds: -1.2, label: 'istotna deceleracja wzrastania', tone: 'bad' },
      redFlag: { dSds: -1.2, baseAgeMonths: 48 },
      segments: [
        { fromAgeM: 48, toAgeM: 60, dSds: 0.05, label: 'stabilny tor wzrastania', tone: 'stable', ghOn: false, rdOn: false },
        { fromAgeM: 60, toAgeM: 72, dSds: -1.2, label: 'istotna deceleracja wzrastania', tone: 'bad', ghOn: false, rdOn: false }
      ]
    },
    weight: null, bmi: null, delayedPuberty: false
  };

  it('sekcja auksologiczna: werdykt całości, najgorszy odcinek i flaga pozycyjna (słownik lekarski)', () => {
    const t = gen({ sex: 'M', ageYears: 7, ageMonths: 0, height: 110, boneAge: 6, trajectory: trajDecel }, {});
    expect(t).toContain('Automatyczna analiza trajektorii wzrostu (okres 4 r.ż. – 7 r.ż.): istotna deceleracja wzrastania.');
    expect(t).toContain('Największe pogorszenie toru obserwowano między 5 r.ż. a 6 r.ż. (ΔSDS −1,20 — istotna deceleracja wzrastania).');
    expect(t).toContain('Względem pomiaru z wieku 4 r.ż. stwierdzono istotne obniżenie pozycji centylowej wzrostu (ΔhSDS −1,20) — obraz deceleracji wzrastania.');
  });

  it('najgorszy odcinek pokrywający cały okres obserwacji nie jest powtarzany', () => {
    const traj = JSON.parse(JSON.stringify(trajDecel));
    traj.height.worst = { fromAgeM: 48, toAgeM: 84, dSds: -1.2, label: 'istotna deceleracja wzrastania', tone: 'bad' };
    const t = gen({ sex: 'M', ageYears: 7, ageMonths: 0, trajectory: traj }, {});
    expect(t).not.toContain('Największe pogorszenie');
  });

  it('brak trajektorii w metrykach: dokument bez nowych zdań (regresja)', () => {
    const t = gen({ sex: 'M', ageYears: 7, ageMonths: 0, height: 110 }, {});
    expect(t).not.toContain('Automatyczna analiza');
    expect(t).not.toContain('pogorszenie toru');
    expect(t).not.toContain('opóźnionego dojrzewania');
  });

  it('nota o opóźnionym dojrzewaniu w badaniu przedmiotowym, próg wg płci (13/14 lat)', () => {
    const noTraj = { height: null, weight: null, bmi: null, delayedPuberty: true };
    const girl = gen(
      { sex: 'F', ageYears: 13, ageMonths: 6, height: 145, trajectory: noTraj },
      { clinical: { tannerBreasts: 1, tannerPubic: 1 } }
    );
    expect(girl).toContain('Nie stwierdzono cech pokwitania w wieku powyżej 13 lat — obraz opóźnionego dojrzewania, wskazana ocena specjalistyczna.');
    const boy = gen({ sex: 'M', ageYears: 14, ageMonths: 6, height: 150, trajectory: noTraj }, {});
    expect(boy).toContain('powyżej 14 lat — obraz opóźnionego dojrzewania');
  });

  it('sekcja przebiegu leczenia GH z odcinków ghOn, umieszczona przed prognozą', () => {
    const trajGh = {
      height: {
        fromAgeM: 96, toAgeM: 132,
        total: { label: 'nadrabia niedobór wzrostu', tone: 'good' }, worst: null, redFlag: null,
        segments: [
          { fromAgeM: 96, toAgeM: 108, dSds: 0.45, label: 'dobra odpowiedź na GH', tone: 'good', ghOn: true, rdOn: false },
          { fromAgeM: 108, toAgeM: 120, dSds: 0.05, label: 'słaba odpowiedź na GH — do oceny', tone: 'warn', ghOn: true, rdOn: false },
          { fromAgeM: 120, toAgeM: 132, dSds: 0.1, label: 'stabilny tor wzrastania', tone: 'stable', ghOn: false, rdOn: false }
        ]
      },
      weight: null, bmi: null, delayedPuberty: false
    };
    const r = epicrisis.generate(
      { sex: 'M', ageYears: 11, ageMonths: 0, height: 135, predictions: { rwt: { value: 172, error: 3 } }, trajectory: trajGh },
      {}
    );
    expect(r.text).toContain('Ocena odpowiedzi wzrostowej na leczenie hormonem wzrostu (analiza trajektorii): w okresie 8 r.ż. – 9 r.ż. — dobra odpowiedź na GH (ΔSDS +0,45); w okresie 9 r.ż. – 10 r.ż. — słaba odpowiedź na GH — do oceny (ΔSDS +0,05).');
    const ig = r.sections.findIndex((x) => x.includes('Ocena odpowiedzi wzrostowej'));
    const ik = r.sections.findIndex((x) => x.includes('Prognozowany wzrost ostateczny'));
    expect(ig).toBeGreaterThanOrEqual(0);
    expect(ik).toBeGreaterThan(ig);
  });

  it('otyłość: ostatni odcinek z aktywną redukcją trafia do rozpoznania; bez rdOn — bez zdania', () => {
    const trajRed = {
      height: null, weight: null,
      bmi: {
        fromAgeM: 132, toAgeM: 150,
        total: { label: 'redukcja nadmiaru masy ciała (BMI)', tone: 'good' }, worst: null, redFlag: null,
        segments: [
          { fromAgeM: 132, toAgeM: 141, dSds: 0.1, label: 'narasta mimo leczenia', tone: 'warn', ghOn: false, rdOn: true },
          { fromAgeM: 141, toAgeM: 150, dSds: -0.4, label: 'redukcja w trakcie leczenia', tone: 'good', ghOn: false, rdOn: true }
        ]
      },
      delayedPuberty: false
    };
    const t = gen({ sex: 'M', ageYears: 12, ageMonths: 6, bmi: 31, bmiPercentile: 98, trajectory: trajRed }, { diagnosis: 'obesity' });
    expect(t).toContain('W okresie zamierzonej redukcji masy ciała analiza trajektorii wskazuje: redukcja w trakcie leczenia (ΔSDS −0,40).');
    const noRd = JSON.parse(JSON.stringify(trajRed));
    noRd.bmi.segments.forEach((s) => { s.rdOn = false; });
    const t2 = gen({ sex: 'M', ageYears: 12, ageMonths: 6, bmi: 31, bmiPercentile: 98, trajectory: noRd }, { diagnosis: 'obesity' });
    expect(t2).not.toContain('zamierzonej redukcji');
  });

  it('karta zaawansowana wystawia model i odcinek terapii GH z wierszy importu (ghSync)', () => {
    const cardSource = fs.readFileSync(path.join(repositoryRoot, 'vilda_advanced_growth.js'), 'utf8');
    expect(cardSource).toContain('window.advancedGrowthTrajectory=TJ9||null');
    expect(cardSource).toContain('q8.ghSync===!0');
    expect(cardSource).toContain('c9.gh={a:g8,b:x8}');
  });

  it('kolektor destyluje model do metrics.trajectory (height/weight/bmi + delayedPuberty)', () => {
    const uiSource = fs.readFileSync(path.join(repositoryRoot, 'vilda_epicrisis_ui.js'), 'utf8');
    expect(uiSource).toContain('trajectory:function(){try{var tj9=s.advancedGrowthTrajectory');
    expect(uiSource).toContain('delayedPuberty:!!tj9.delayedPuberty');
    expect(uiSource).toContain('ghOn:!!s9.ghOn,rdOn:!!s9.rdOn');
  });

  it('prefill Tannera z rekordu pacjenta (Vault) ze strażnikiem świeżości 12 mies., za formularzem głównym', () => {
    const uiSource = fs.readFileSync(path.join(repositoryRoot, 'vilda_epicrisis_ui.js'), 'utf8');
    expect(uiSource).toContain('he2=!isNaN(t2)&&t2>=1&&t2<=5?{stage:t2,atAgeMonths:');
    expect(uiSource).toContain('a9-he2.atAgeMonths<=12');
    expect(uiSource).toContain('he=null,he2=null');
  });
});
