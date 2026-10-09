import { readFileSync } from 'node:fs';
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
});
