import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = loadBrowserScript('vilda_hormone_lifespan_data.js');
const data = browser.VildaHormoneLifespanData;
const require = createRequire(import.meta.url);
const readSource = file => JSON.parse(readFileSync(
  new URL(`../../docs/clinical/hormone-lifespan/${file}`, import.meta.url), 'utf8'));
const infant = data.referenceData.femaleInfantMedians;
const profiles = data.lifespanData.hormones;
const displayAt = (id, age) => profiles[id].displaySegments.flatMap(s => s.points)
  .find(point => point.ageYears === age)?.relative;

describe('Poglądowy przebieg hormonów — produkcyjne dane i granice dowodów', () => {
  it('eksport przeglądarkowy i CommonJS zachowuje cały zatwierdzony zbiór źródłowy', () => {
    expect(require('../../vilda_hormone_lifespan_data.js')).toEqual(data);
    expect(data.referenceData).toEqual(readSource('female-reference-data.json'));
    expect(data.lifespanData).toEqual(readSource('female-lifespan-data.json'));
    expect(data.version).toBe('2026-10-09.5');
    expect(Object.keys(profiles).sort()).toEqual(['amh', 'e2', 'fsh', 'inhb', 'lh']);
  });

  it('pięć niemowlęcych modeli ma 99 oryginalnych median i nie dopisuje urodzenia', () => {
    expect(infant.population.termBirthsOnly).toBe(true);
    expect(infant.source.supplementLicense).toBe('CC BY 4.0');
    for (const [id, source] of Object.entries(infant.hormones)) {
      expect(source.points).toHaveLength(99);
      expect(source.points[0].ageYears).toBe(0.02);
      expect(source.points.at(-1).ageYears).toBe(1);
      expect(profiles[id].points.slice(0, 99)).toEqual(source.points.map(point => ({
        ageYears: point.ageYears, value: point.median,
        source: 'ljubicic2022', statistic: 'model_median'
      })));
    }
  });

  it('szczyty minipuberty zachowują wysokość na tle całego życia, bez osobnych mnożników', () => {
    const maxima = { lh: 27.83, fsh: 64.54, amh: 28.99, inhb: 52.474, e2: 264 };
    for (const [id, maximum] of Object.entries(maxima)) {
      expect(profiles[id].normalizationMaximum).toBe(maximum);
      for (const point of profiles[id].displaySegments[0].points) {
        const median = infant.hormones[id].points.find(p => p.ageYears === point.ageYears).median;
        expect(point.relative).toBe(median / maximum);
      }
    }
    expect(Math.max(...infant.hormones.e2.points.map(p => p.median))).toBe(23.908);
    expect(23.908 / profiles.e2.normalizationMaximum).toBeCloseTo(0.09056, 4);
    expect(Math.max(...infant.hormones.amh.points.map(p => p.median)) / maxima.amh)
      .toBeCloseTo(0.657, 3);
  });

  it('mosty dzieciństwa są ciągłe i pozbawione jednostek oraz wymyślonych stężeń', () => {
    for (const profile of Object.values(profiles)) {
      for (let i = 1; i < profile.displaySegments.length; i++) {
        expect(profile.displaySegments[i].points[0]).toEqual(profile.displaySegments[i - 1].points.at(-1));
      }
      for (const segment of profile.displaySegments) {
        if (segment.kind === 'schematic') {
          expect(segment.unit).toBeNull();
          expect(segment.meaning).toBeTruthy();
        }
        for (const point of segment.points) {
          expect(Object.keys(point).sort()).toEqual(['ageYears', 'relative']);
          expect(point.relative).toBeGreaterThanOrEqual(0);
          expect(point.relative).toBeLessThanOrEqual(1);
        }
      }
    }
    expect(profiles.inhb.displaySegments[1]).toMatchObject({ role: 'childhood_bridge', kind: 'schematic' });
    expect(profiles.inhb.displaySegments[1].points.map(p => p.ageYears)).toEqual([1, 5.6]);
  });

  it('AMH nie wymusza odbicia do szerokiej grupy dziecięcej, ale zachowuje tę medianę w dowodach', () => {
    expect(profiles.amh.points.find(p => p.ageYears === 2.95).value).toBe(14.58);
    expect(displayAt('amh', 2.95)).toBeUndefined();
    expect(displayAt('amh', 1.3)).toBe(displayAt('amh', 3));
    expect(displayAt('amh', 0.9)).toBeGreaterThan(displayAt('amh', 1.3));
    expect(displayAt('amh', 3)).toBeLessThan(displayAt('amh', 16.95));
    expect(displayAt('amh', 21.5)).toBe(displayAt('amh', 28));
    expect(profiles.amh.points.at(-1).ageYears).toBe(43);
    expect(profiles.amh.qualitativeTail).not.toHaveProperty('value');
  });

  it('E2 nie łączy modelu nastolatek z niższą medianą jednej fazy dorosłych', () => {
    expect(profiles.e2.points.find(p => p.ageYears === 24.7)).toMatchObject({
      value: 156, statistic: 'early_follicular_group_median'
    });
    expect(displayAt('e2', 18)).toBe(displayAt('e2', 30));
    expect(displayAt('e2', 30)).toBe(displayAt('e2', 45));
    expect(displayAt('e2', 30)).not.toBe(156 / profiles.e2.normalizationMaximum);
    expect(displayAt('e2', 45)).toBeGreaterThan(displayAt('e2', 55));
    const source = readSource('evidence/madsen2022-female-median-si.json');
    for (const point of source.hormones.e2.points) {
      expect(profiles.e2.points.find(p => p.ageYears === point.ageYears).value)
        .toBeCloseTo(Math.exp(point.M_logSIx1e6) / 1e6, 10);
    }
  });

  it('osobny cykl zachowuje pochodzenie median i jawne ilustracyjne domknięcie', () => {
    const cycle = data.lifespanData.cycleSchematic;
    expect(cycle.sourceStandardizedCycleDays).toBe(29);
    expect(cycle.illustrativeCycleDays).toBe(28);
    expect(cycle.sourcePhases.map(p => p.medianPmolL)).toEqual([125, 172, 464, 817, 390, 505, 396]);
    expect(cycle.points.at(-1)).toMatchObject({
      day: 28, role: 'illustrative_return_not_a_published_day28_median'
    });
    expect(cycle.points.at(-1).relative).toBe(cycle.points[0].relative);
    expect(cycle.sourceDoi).toBe('10.1016/j.plabm.2021.e00211');
  });

  it('męskie szczyty mają odrębny czas; krzywa INSL3 nie staje się normą', () => {
    for (const [id, day] of Object.entries({ fsh: 11, lh: 18, insl3: 27, t: 29 })) {
      const hormone = data.maleHormones.find(h => h.id === id);
      expect(hormone.ages[data.maleAges.indexOf(0.085)]).toBe(day / 365.25);
      expect(hormone.values).toHaveLength(hormone.ages.length);
      expect(hormone).not.toHaveProperty('unit');
      expect(hormone).not.toHaveProperty('referenceInterval');
    }
    expect(data.maleAges.at(-1)).toBe(90);
  });

  it('męskie krzywe zachowują pełne oryginalne punkty i nie wybierają uproszczonego podzbioru', () => {

    expect(data.maleAges).toHaveLength(33);
    expect(data.maleHormones.map(hormone => hormone.id))
      .toEqual(['lh', 'fsh', 't', 'insl3', 'amh', 'inhb']);
    for (const hormone of data.maleHormones) {
      const ages = hormone.ages || data.maleAges;
      expect(hormone).not.toHaveProperty('displayPointIndices');
      expect(hormone.values).toHaveLength(33);
      expect(ages).toHaveLength(hormone.values.length);
      expect(ages).toEqual([...new Set(ages)].sort((a, b) => a - b));
      for (const value of hormone.values) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
    // Pin all original anchors, individual peak ages and stage widths from
    // the unmodified audyt base 0333abe4 (not the implementation under test).
    // Clinical explanatory copy was deliberately updated for Walravens; it is
    // excluded from this geometry fingerprint, not replaced with a new baseline.
    const maleData = JSON.stringify({ maleAges: data.maleAges,
      maleHormones: data.maleHormones.map(({ id, ages, values }) => ({ id, ages, values })), maleStages: data.maleStages });
    expect(createHash('sha256').update(maleData).digest('base64')).toBe('9D8YfxhHE4WrExAPprGh9YTdiiAHaobSc/ElkHQXn5U=');
  });
});

describe('Testosteron chłopców — źródłowe p50 i rozłączna polityka wieku', () => {
  const profile = id => data.patientPointData.profiles.find(item => item.id === id);

  it('pakuje granice z oddzielnej polityki źródeł i zachowuje różnicę między routingiem a dziedziną publikacji', () => {
    const policy = readSource('testosterone-reference-policy.json');
    expect(policy.kind).toBe('educational-source-selection');
    expect(policy.profiles.map(({ id, minAge, maxAge, maxAgeExclusive }) => ({ id, minAge, maxAge, maxAgeExclusive })))
      .toEqual([
        { id: 'kelsey2014-male-t-childhood', minAge: 3, maxAge: 6, maxAgeExclusive: true },
        { id: 'madsen2022-male-t', minAge: 6, maxAge: 18, maxAgeExclusive: true },
        { id: 'walravens2025-male-t-18-29', minAge: 18, maxAge: 30, maxAgeExclusive: true },
        { id: 'walravens2025-male-t-30-39', minAge: 30, maxAge: 40, maxAgeExclusive: true },
        { id: 'walravens2025-male-t-40-49', minAge: 40, maxAge: 50, maxAgeExclusive: true },
        { id: 'walravens2025-male-t-50-59', minAge: 50, maxAge: 60, maxAgeExclusive: true },
        { id: 'walravens2025-male-t-60-69', minAge: 60, maxAge: 70, maxAgeExclusive: true },
        { id: 'walravens2025-male-t-70-79', minAge: 70, maxAge: 80, maxAgeExclusive: true },
        { id: 'walravens2025-male-t-80-plus', minAge: 80, maxAge: 86, maxAgeExclusive: false }
      ]);
    for (const route of policy.profiles) {
      const generated = profile(route.id);
      expect(generated).toMatchObject({ minAge: route.minAge, maxAge: route.maxAge,
        maxAgeExclusive: route.maxAgeExclusive, interpolation: route.source === 'walravens2025' ? 'constant' : 'pchip', analyte: 't', sex: 'male', unit: 'nmol/L' });
      expect(generated.provenance.sourceRouting).toEqual({ version: policy.version, source: route.source,
        minAge: route.minAge, maxAge: route.maxAge, maxAgeExclusive: route.maxAgeExclusive,
        sourceDomain: route.sourceDomain, retainAllSourcePoints: true });
    }
    expect(profile('madsen2022-male-t').provenance.sourceRouting.sourceDomain).toEqual({ minAge: 6, maxAge: 18 });
    expect(policy.interpolation.crossSourceInterpolation).toBe(false);
    expect(policy.interpolation.extrapolation).toBe(false);
  });

  it('zachowuje oryginalne komórki, skalę M, pełny punkt 18 lat i pochodzenie 13 węzłów Madsena', () => {
    const original = readSource('evidence/patient-point/madsen2022-male-p50-lms.json');
    const generated = profile('madsen2022-male-t');
    const sourcePoints = original.hormones.testosterone.points;
    expect(generated.points).toHaveLength(13);
    expect(generated.points.map(point => point.ageYears)).toEqual([6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
    expect(generated.points).toEqual(sourcePoints.map(point => ({ ageYears: point.ageYears, value: point.centralConcentration })));
    expect(generated.provenance.sourceSha256).toBe('45cd1b63284c9f53a5936abee7ab8d8e6fce13a19025d4e2cbed0e5b3468897e');
    expect(generated.provenance.sourceFile).toBe('Supplemental_Table_1_LMS_entries.xlsx');
    expect(generated.provenance.supplementDoi).toBe('10.6084/m9.figshare.17153336.v1');
    expect(generated.provenance.sourceCells).toEqual(sourcePoints.map(point => point.sourceCells));
    expect(generated.provenance.sourceCells[0]).toEqual([
      'LCMSMS hormones!AF19', 'LCMSMS hormones!AG19', 'LCMSMS hormones!AH19', 'LCMSMS hormones!AI19'
    ]);
    expect(generated.provenance.sourceCells.at(-1)).toEqual([
      'LCMSMS hormones!AF31', 'LCMSMS hormones!AG31', 'LCMSMS hormones!AH31', 'LCMSMS hormones!AI31'
    ]);
    expect(generated.provenance.sourceLms).toEqual(sourcePoints.map(({ ageYears, L, M_logSIx1e6, S }) => ({ ageYears, L, M_logSIx1e6, S })));
    expect(generated.provenance.transform).toEqual(original.transform);
    expect(generated.statistic).toBe('model-central');
    for (const [index, point] of generated.points.entries()) {
      expect(point.value).toBeCloseTo(Math.exp(sourcePoints[index].M_logSIx1e6) / 1e6, 13);
    }
    expect(generated.provenance.interpolation).toMatchObject({
      method: 'pchip', valueScale: 'concentration-nmol-per-litre', madsenPublishedStepYears: 1,
      crossSourceInterpolation: false, extrapolation: false
    });
    expect(generated.provenance.interpolation.madsenBetweenNodeMeaning).toContain('not a reconstruction');
  });

  it('zachowuje ograniczenia oznaczenia i populacji bez dopisywania godzin, stadium lub obsługi wyników poniżej LOQ', () => {
    const original = readSource('evidence/patient-point/madsen2022-male-p50-lms.json');
    const generated = profile('madsen2022-male-t');
    expect(generated.compatibleAssayMethodIds).toEqual(['lc-ms/ms', 'lc-ms-ms', 'lcmsms']);
    expect(generated.method).toBe(original.hormones.testosterone.assay);
    expect(generated.population).toContain('Bergen Growth Study 2 + Fit Futures');
    expect(generated.provenance.population).toEqual(original.population);
    expect(generated.provenance.population.sampling).toContain('08:00–14:00');
    expect(generated.provenance.lowerLimitOfQuantification).toBe(0.02);
    expect(generated.points[0].value).toBeGreaterThan(generated.provenance.lowerLimitOfQuantification);
    expect(generated.provenance.belowLoqModelHandling).toMatchObject({ rule: null, reported: false });
    expect(generated).not.toHaveProperty('requiredGonadalStage');
    expect(generated).not.toHaveProperty('termOnly');
    expect(generated).not.toHaveProperty('morningOnly');
    expect(generated).not.toHaveProperty('referenceInterval');
    expect(generated).not.toHaveProperty('clinicalCutoff');
  });

  it('zachowuje pełny źródłowy Kelsey dla dzieci, niezależnie od łagodnego rysunku dzieciństwa', () => {
    const childhood = profile('kelsey2014-male-t-childhood');
    const original = readSource('evidence/patient-point/testosterone-model.json');
    expect(childhood.points).toHaveLength(851);
    expect(childhood.points[0]).toEqual({ ageYears: 3, value: 0.3764139001167295 });
    expect(childhood.points.at(-1)).toEqual({ ageYears: 88, value: 13.222919801641392 });
    expect(childhood.formula).toEqual(original.formula);
    expect(childhood.provenance.sourceRouting.sourceDomain).toEqual({ minAge: 3, maxAge: 88 });
    expect(childhood.provenance.correctionDoi).toBe('10.1371/journal.pone.0117674');
    expect(profile('kelsey2014-male-t')).toBeUndefined();
  });

  it('zachowuje średnie TT, wiek i liczebność grup z tabeli 1 Walravens, bez pomylenia z wolnym testosteronem', () => {
    const original = readSource('evidence/patient-point/walravens2025-male-total-testosterone-group-means.json');
    expect(original.source.doi).toBe('10.1210/clinem/dgaf507');
    expect(original.source.table).toBe(1);
    expect(original.unit).toBe('nmol/L');
    const independentlyChecked = [
      ['18-29', 23.8, 141, 20.7], ['30-39', 34.3, 252, 20.0], ['40-49', 43.5, 207, 18.1],
      ['50-59', 55, 150, 16.9], ['60-69', 65.1, 177, 17.1], ['70-79', 74.7, 167, 17.0],
      ['80-plus', 82.1, 100, 15.9]
    ];
    expect(independentlyChecked.reduce((sum, row) => sum + row[2], 0)).toBe(1194);
    for (const [suffix, age, n, mean] of independentlyChecked) {
      const item = profile(`walravens2025-male-t-${suffix}`);
      expect(item).toMatchObject({ statistic: 'group-mean', interpolation: 'constant', unit: 'nmol/L',
        meanAge: age, groupN: n, ageGroup: { meanAge: age, n, sourceMean: mean, sourceUnit: 'nmol/L' } });
      expect(item.points.length).toBeGreaterThanOrEqual(2);
      expect(item.points.every(point => point.value === mean)).toBe(true);
      expect(item.provenance).toMatchObject({ doi: '10.1210/clinem/dgaf507', table: 1,
        participants: 1194, groupParticipants: n, publishedMeanAge: age, sourceMean: mean,
        sourceUnit: 'nmol/L', sourceToCanonicalFactor: 1 });
      expect(item).not.toHaveProperty('formula');
      expect(item).not.toHaveProperty('referenceInterval');
      expect(item).not.toHaveProperty('clinicalCutoff');
    }
  });
});
