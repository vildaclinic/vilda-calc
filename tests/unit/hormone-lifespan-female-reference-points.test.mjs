import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const engine = require('../../vilda_hormone_lifespan_reference.js');
const runtime = require('../../vilda_hormone_lifespan_data.js');
const display = require('../../vilda_hormone_lifespan_display.js');
const data = runtime.patientPointData;
const read = name => JSON.parse(readFileSync(new URL(
  `../../docs/clinical/hormone-lifespan/${name}`, import.meta.url), 'utf8'));
const policy = read('female-adolescent-reference-policy.json');
const addedIds = [...policy.amh.profiles.map(p => p.id), policy.inhb.id];
const laterMaleIds = read('male-amh-reference-policy.json').profiles.map(p => p.id);
const laterFemaleIds = read('female-adult-amh-reference-policy.json').profiles.map(p => p.id);
const evaluate = (analyte = 'amh', ageYears = 15, extra = {}) => engine.evaluate(data, {
  analyte, sex: 'female', ageYears, preterm: 'no',
  measurement: { value: .45, unit: analyte === 'amh' ? 'ng/mL' : 'pg/mL' }, ...extra
});
const unavailable = reason => ({ status: 'unavailable', reason });

describe('Źródłowe mediany AMH i inhibiny B dziewcząt — zwykły wykres', () => {
  it('zachowuje wszystkie 60 wcześniejszych profili i przeliczenia dokładnie, dodając sześć osobnych odniesień', () => {
    const original = { ...data, version: '2026-10-11.1',
      profiles: data.profiles.filter(p => !addedIds.includes(p.id) && !laterMaleIds.includes(p.id) && !laterFemaleIds.includes(p.id)) };
    expect(data.profiles).toHaveLength(74);
    expect(laterFemaleIds).toHaveLength(5);
    expect(data.profiles.filter(p => p.ordinaryOnly && p.sex === 'female' && !laterFemaleIds.includes(p.id)).map(p => p.id)).toEqual(addedIds);
    expect(original.profiles).toHaveLength(60);
    expect(createHash('sha256').update(JSON.stringify(original)).digest('hex'))
      .toBe('9d5c86ac8f47e822c5768c8ac68e7987e6e46cafdfe37c0a8c776f9cd3e88dff');
    expect(data).toEqual(read('population-reference-data.json'));
    expect(data.notClinicalReference).toBe(true);
  });

  it('dla 15-latki i AMH 0,45 ng/mL zwraca 21,14 pmol/L, czyli medianę całej grupy ≈2,96 ng/mL', () => {
    const result = evaluate();
    expect(result).toMatchObject({ status: 'ready', referenceValue: 21.14,
      profile: { id: 'jopling2018-female-amh-age-15-under18',
        statistic: 'group-median', interpolation: 'constant', approximate: false,
        specimen: 'lithium-heparin-plasma', minAge: 15, maxAge: 18, maxAgeExclusive: true,
        ageGroup: { label: '15–18,9 lat', minAge: 15, maxAge: 18.9, n: 30,
          sourceMedian: 21.14, sourceUnit: 'pmol/L' },
        provenance: { doi: '10.1002/edm2.21', table: 1, sourceSpecimen: 'lithium-heparin plasma' } }
    });
    expect(result.value).toBeCloseTo(.45 / .1401, 12);
    expect(result.referenceValue * .1401).toBeCloseTo(2.961714, 12);
    expect(result.profile.patientNote).toBe('Grupa 15–18,9 lat · Access AMH, osocze.');
    expect(result).not.toHaveProperty('classification');
    expect(result).not.toHaveProperty('percentile');
  });

  it.each([[1.01, 14.58, '1–4,9 lat', 42], [5, 11.44, '5–7,9 lat', 42],
    [8, 20.42, '8–11,9 lat', 47], [12, 17.87, '12–14,9 lat', 33], [15, 21.14, '15–18,9 lat', 30]])(
    'AMH w wieku %s zachowuje opublikowaną medianę, etykietę i N grupy', (age, median, label, n) => {
      const result = evaluate('amh', age);
      expect(result).toMatchObject({ status: 'ready', referenceValue: median,
        profile: { ageGroup: { label, n } } });
      for (const offset of [.001, .25, .5]) {
        expect(evaluate('amh', age + offset).referenceValue).toBe(median);
      }
      expect(engine.sampleProfile(result.profile, 27)).toHaveLength(27);
      expect(engine.sampleProfile(result.profile, 27).every(p => p.value === median)).toBe(true);
    });

  it('jawnie rozstrzyga granice grup bez zmiany niemowlęcego źródła w wieku dokładnie jednego roku', () => {
    expect(evaluate('amh', 1)).toMatchObject({ status: 'ready', referenceValue: 7.078,
      profile: { id: 'ljubicic2022-female-amh' } });
    expect(evaluate('amh', 1 + 1e-8).profile.id).toBe('jopling2018-female-amh-age-1-under5');
    expect(evaluate('amh', 1, { ageUpperYears: 2, ageUpperInclusive: false }))
      .toEqual(unavailable('ambiguous-age'));
    const first = data.profiles.find(p => p.id === policy.amh.profiles[0].id);
    expect(first.minAgeExclusive).toBe(true);
    expect(engine.referenceAt(first, 1)).toBeNull();
    expect(engine.sampleProfile(first, 5)[0].ageYears).toBeGreaterThan(1);
    for (const [boundary, below, at] of [[5, 14.58, 11.44], [8, 11.44, 20.42],
      [12, 20.42, 17.87], [15, 17.87, 21.14]]) {
      expect(evaluate('amh', boundary - 1e-7).referenceValue).toBe(below);
      expect(evaluate('amh', boundary).referenceValue).toBe(at);
      expect(evaluate('amh', boundary - 1, { ageUpperYears: boundary, ageUpperInclusive: false }).referenceValue).toBe(below);
      expect(evaluate('amh', boundary - 1, { ageUpperYears: boundary, ageUpperInclusive: true }))
        .toEqual(unavailable('ambiguous-age'));
    }
    expect(evaluate('amh', 17, { ageUpperYears: 18, ageUpperInclusive: false }).referenceValue).toBe(21.14);
    expect(evaluate('amh', 17, { ageUpperYears: 18 })).toEqual(unavailable('ambiguous-age'));
    for (const age of [18, 18.9, 19, 40]) {
      expect(evaluate('amh', age).profile.id).toMatch(/^fda2017-female-amh-/);
    }
    for (const age of [46, 50, 90]) expect(evaluate('amh', age)).toEqual(unavailable('unsupported-age'));
  });

  it('porównanie grupy nie wymaga stadium ani informacji okołoporodowych starszej dziewczynki', () => {
    for (const preterm of [undefined, 'unknown', 'yes']) {
      for (const puberty of [undefined, { kind: 'Th', stage: 1 }, { kind: 'Th', stage: 5 }]) {
        expect(evaluate('amh', 15, { preterm, puberty }).referenceValue).toBe(21.14);
      }
    }
    expect(evaluate('amh', .25, { preterm: 'unknown' })).toEqual(unavailable('preterm-context'));
  });

  it('źródło osocza przyjmuje brak informacji, ale nie utożsamia znanej surowicy lub EDTA z Li-heparyną', () => {
    for (const specimen of [undefined, null, '', 'unknown', 'plasma_li_heparin',
      'lithium-heparin-plasma', 'li-heparin-plasma', 'lithium-heparin plasma', 'osocze z heparyną litową']) {
      const result = evaluate('amh', 15, { specimen });
      expect(result.status).toBe('ready');
      expect(result).not.toHaveProperty('methodConfirmed');
    }
    for (const specimen of ['serum', 'surowica', 'plasma', 'osocze', 'edta-plasma', 'whole-blood', 'saliva']) {
      expect(evaluate('amh', 15, { specimen })).toEqual(unavailable('incompatible-specimen'));
    }
    for (const assayMethodId of [undefined, 'unknown', 'access-amh', 'beckman-access-amh', 'access-2', 'beckman-access-2']) {
      expect(evaluate('amh', 15, { assayMethodId }).status).toBe('ready');
    }
    for (const assayMethodId of ['roche-elecsys', 'amh-gen-ii', 'immulite-2000']) {
      expect(evaluate('amh', 15, { assayMethodId })).toEqual(unavailable('incompatible-assay'));
    }
    expect(evaluate('amh', .25, { specimen: 'serum' }).status).toBe('ready');
    expect(evaluate('amh', .25, { specimen: 'lithium-heparin-plasma' })).toEqual(unavailable('incompatible-specimen'));
    expect(evaluate('inhb', 15, { specimen: 'serum' }).status).toBe('ready');
    expect(evaluate('inhb', 15, { specimen: 'plasma_li_heparin' })).toEqual(unavailable('incompatible-specimen'));
  });

  it('wartość i mediana AMH mają równoważne jednostki bez przenoszenia konwersji na inne anality', () => {
    const base = evaluate();
    for (const unit of ['ng/mL', 'μg/L', 'ug/L']) {
      const result = evaluate('amh', 15, { measurement: { value: .45, unit } });
      expect(result.value).toBe(base.value);
      expect(result.referenceValue).toBe(base.referenceValue);
    }
    expect(evaluate('amh', 15, { measurement: { value: .45 / .1401, unit: 'pmol/L' } }).value).toBeCloseTo(base.value, 12);
    expect(evaluate('amh', 15, { measurement: { value: .45, unit: 'pg/mL' } })).toEqual(unavailable('unsupported-unit'));
    for (const unit of ['pg/mL', 'ng/L']) {
      expect(evaluate('inhb', 15, { measurement: { value: 44, unit } })).toMatchObject({
        status: 'ready', value: 44, referenceValue: 44
      });
    }
  });

  it('inhibina B przy 15 latach ma przybliżone p50 44 pg/mL, ze wszystkimi 24 pierwotnymi węzłami', () => {
    const result = evaluate('inhb');
    const comparison = runtime.inhibinComparisonReferenceData.profiles[0];
    expect(result).toMatchObject({ status: 'ready', referenceValue: 44,
      profile: { id: 'borelli2025-female-inhb-age-5p6-20', minAge: 5.6, maxAge: 20,
        statistic: 'median', approximate: true, interpolation: 'pchip', specimen: 'serum',
        provenance: { doi: '10.1210/clinem/dgae439', digitizationTolerancePgMl: 2 } }
    });
    expect(result.profile.points).toHaveLength(24);
    expect(result.profile.points).toEqual(comparison.points);
    expect(result.profile.points[0].ageYears).toBe(5.6);
    expect(result.profile.points.at(-1).ageYears).toBe(47);
    for (const age of [8, 8.5, 12.5, 15, 17.8, 19, 20]) {
      expect(evaluate('inhb', age).referenceValue).toBe(engine.referenceAt(comparison, age));
    }
    expect(evaluate('inhb', 15, { ageUpperYears: 16, ageUpperInclusive: false }).referenceValue).toBe(44);
    for (const age of [1.01, 5.5999, 20.0001, 47]) {
      expect(evaluate('inhb', age)).toEqual(unavailable('unsupported-age'));
    }
    expect(evaluate('inhb', 20, { ageUpperYears: 21, ageUpperInclusive: false })).toEqual(unavailable('ambiguous-age'));
  });

  it('F6/33 pg/mL otrzymuje źródłową medianę około 11 przy miesiącach 0 i przy podaniu samych lat', () => {
    const core = require('../../vilda_lab_puberty.js');
    for (const age of [{ years: 6, months: 0, precision: 'month' }, { years: 6, precision: 'year' }]) {
      const resolved = core.resolveAge({ age });
      for (const unit of ['pg/mL', 'ng/L']) {
        const result = evaluate('inhb', resolved.lowerYears, { ageUpperYears: resolved.upperYears,
          ageUpperInclusive: resolved.upperInclusive, measurement: { value: 33, unit } });
        expect(result).toMatchObject({ status: 'ready', value: 33, referenceValue: 11,
          profile: { id: 'borelli2025-female-inhb-age-5p6-20', minAge: 5.6, maxAge: 20,
            statistic: 'median', approximate: true, ordinaryOnly: true } });
      }
    }
  });

  it('kwalifikuje cały możliwy wiek od 5,6 i zachowuje lukę źródłową oraz górny brzeg 20', () => {
    expect(evaluate('inhb', 5.6)).toMatchObject({ status: 'ready', referenceValue: 11 });
    for (const [low, high] of [[1.08, 1.09], [5, 6], [5.59, 5.61], [5 + 7 / 12, 5 + 8 / 12]]) {
      expect(evaluate('inhb', low, { ageUpperYears: high, ageUpperInclusive: false }))
        .toEqual(unavailable('unsupported-age'));
    }
    expect(evaluate('inhb', 5 + 8 / 12, { ageUpperYears: 5 + 9 / 12, ageUpperInclusive: false }).referenceValue)
      .toBeCloseTo(11, 10);
    expect(evaluate('inhb', 7, { ageUpperYears: 8, ageUpperInclusive: false }).referenceValue).toBe(12);
    expect(evaluate('inhb', 15).referenceValue).toBe(44);
    expect(evaluate('inhb', 20).referenceValue).toBe(34);
    expect(evaluate('inhb', 20, { ageUpperYears: 20.01 })).toEqual(unavailable('ambiguous-age'));
  });

  it('rozszerzenie źródła nie zmienia 65 pozostałych profili, żadnej geometrii ani odrębnego porównania 8–20', () => {
    const unchangedProfiles = data.profiles.filter(p => p.id !== policy.inhb.id && !laterMaleIds.includes(p.id) && !laterFemaleIds.includes(p.id));
    expect(unchangedProfiles).toHaveLength(65);
    expect(createHash('sha256').update(JSON.stringify(unchangedProfiles)).digest('hex'))
      .toBe('6ec13e2cb5556a6a5e57df7bba1e3032007215b713c6937cccabbe7368ade1f4');
    const unchangedRuntime = Object.fromEntries(Object.entries(runtime).filter(([key]) => key !== 'patientPointData'));
    expect(createHash('sha256').update(JSON.stringify(unchangedRuntime)).digest('hex'))
      .toBe('380884eb2367b1c48f52d580ee3d3898441d5b204bd979e3b7a12fe8321baa3d');
    expect(data.profiles.some(p => p.id === 'borelli2025-female-inhb-age-8-20')).toBe(false);
    const model = display.buildInhibinComparison(runtime, engine, 'puberty');
    expect(model).not.toBeNull();
    const context = { analyte: 'inhb', sex: 'female', ageYears: 6, measurement: { value: 33, unit: 'pg/mL' } };
    expect(engine.evaluate(model.referenceData, context)).toEqual(unavailable('unsupported-age'));
    expect(engine.evaluate(model.referenceData, { ...context, ageYears: 8 })).toMatchObject({
      status: 'ready', referenceValue: 14, profile: { id: 'borelli2025-female-inhb-puberty-comparison' } });
  });

  it('mediana wykresu nie zmienia laboratoryjnego porównania F6/33 z zakresem Labcorp poniżej 129', () => {
    const lab = require('../../vilda_lab_inhibin_b.js');
    const labData = require('../../vilda_lab_inhibin_b_data.js');
    const result = lab.evaluate({ analyte: 'inhibin_b', referenceSelection: 'automatic', sex: 'F',
      age: { years: 6, months: 0, precision: 'month' }, value: '33', unit: 'pg/mL' }, labData);
    expect(result.referencePreview.byAge).toMatchObject({ status: 'within', range: {
      id: 'labcorp-f-6-9', profileId: 'labcorp-inhibin-b-children',
      bounds: { lower: null, upper: { operator: '<', value: 129 } } } });
    const plot = evaluate('inhb', 6, { measurement: { value: 33, unit: 'pg/mL' } });
    expect(plot.referenceValue).toBe(11);
    expect(plot).not.toHaveProperty('classification');
  });

  it('nowo pokryty wiek 6 lat zachowuje bramki materiału, metody, leczenia i wyniku cenzurowanego', () => {
    expect(evaluate('inhb', 6, { specimen: 'plasma' })).toEqual(unavailable('incompatible-specimen'));
    expect(evaluate('inhb', 6, { assayMethodId: 'access-amh' })).toEqual(unavailable('incompatible-assay'));
    expect(evaluate('inhb', 6, { contraindicated: true })).toEqual(unavailable('contraindicated'));
    expect(evaluate('inhb', 6, { measurement: { value: 33, unit: 'pg/mL', operator: '<' } }))
      .toEqual(unavailable('censored-result'));
    expect(evaluate('inhb', 6, { specimen: 'serum', assayMethodId: 'inhibin-b-gen-ii' }).status).toBe('ready');
  });

  it('zachowuje osobny profil porównania płci bez nakładania z nowym profilem zwykłego widoku', () => {
    const model = display.buildInhibinComparison(runtime, engine, 'puberty');
    expect(model).not.toBeNull();
    const patient = { analyte: 'inhb', sex: 'female', ageYears: 15, measurement: { value: 20, unit: 'pg/mL' } };
    const result = engine.evaluate(model.referenceData, patient);
    expect(result).toMatchObject({ status: 'ready', referenceValue: 44,
      profile: { id: 'borelli2025-female-inhb-puberty-comparison' } });
    expect(engine.evaluate(runtime, patient)).toMatchObject({ status: 'ready', referenceValue: 44,
      profile: { id: 'borelli2025-female-inhb-age-5p6-20' } });
    expect(model.referenceData.patientPointData.profiles.some(p => p.id === policy.inhb.id)).toBe(false);
    expect(data.profiles.some(p => p.id === policy.inhb.id)).toBe(true);
  });

  it.each(['amh', 'inhb'])('nowe odniesienie %s nie omija przeciwwskazań ani nie wyprowadza liczby z cenzurowanego wyniku', analyte => {
    expect(evaluate(analyte, 15, { contraindicated: true })).toEqual(unavailable('contraindicated'));
    for (const operator of ['<', '>', '<=', '>=', '≤', '≥']) {
      expect(evaluate(analyte, 15, { measurement: { value: 2, unit: data.unitConversions[analyte].unit, operator } }))
        .toEqual(unavailable('censored-result'));
    }
    for (const value of [-1, NaN, Infinity, '0.45', null]) {
      expect(evaluate(analyte, 15, { measurement: { value, unit: data.unitConversions[analyte].unit } }))
        .toEqual(unavailable('invalid-value'));
    }
    expect(evaluate(analyte, 15, { measurement: { value: 0, unit: data.unitConversions[analyte].unit } }).value).toBe(0);
  });
});
