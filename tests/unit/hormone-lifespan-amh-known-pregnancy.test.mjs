import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { beforeFshCaliperBundle } from '../support/prior-female-gonadotropin-bundle.mjs';

const require = createRequire(import.meta.url);
const runtime = require('../../vilda_hormone_lifespan_data.js');
const engine = require('../../vilda_hormone_lifespan_reference.js');
const policy = JSON.parse(readFileSync(new URL(
  '../../docs/clinical/hormone-lifespan/female-adolescent-reference-policy.json', import.meta.url), 'utf8')).amh;
const pregnancies = ['pregnancy_t1', 'pregnancy_t2', 'pregnancy_t3'];
const groups = [[2, 14.58], [6, 11.44], [9, 20.42], [13, 17.87], [16, 21.14]];
const evaluate = (ageYears, cyclePhase) => engine.evaluate(runtime.patientPointData, {
  analyte: 'amh', sex: 'female', ageYears, cyclePhase,
  measurement: { value: 1, unit: 'ng/mL' }
});

describe('AMH Jopling — znana ciąża jako ostrożnościowa reguła aplikacji', () => {
  it.each(groups)('wiek %s: każdy znany trymestr wyłącza porównanie bez zastępczego źródła', (age) => {
    for (const cyclePhase of pregnancies) {
      expect(evaluate(age, cyclePhase)).toEqual({
        status: 'unavailable', reason: 'incompatible-reproductive-context'
      });
    }
  });

  it.each(groups)('wiek %s: brak kontekstu i zwykłe fazy zachowują źródłową medianę %s', (age, median) => {
    for (const cyclePhase of [undefined, null, '', 'unknown', 'follicular', 'ovulation', 'luteal']) {
      const result = evaluate(age, cyclePhase);
      expect(result).toMatchObject({ status: 'ready', referenceValue: median,
        profile: { statistic: 'group-median', interpolation: 'constant',
          specimen: 'lithium-heparin-plasma', excludedCyclePhases: pregnancies } });
      expect(result.value).toBeCloseTo(1 / .1401, 12);
      expect(result.profile.id).toMatch(/^jopling2018-female-amh-/);
      expect(result).not.toHaveProperty('classification');
    }
  });

  it('polityka jest jawna, wersjonowana i odróżniona od kryteriów publikacji', () => {
    expect(policy.excludedCyclePhases).toEqual(pregnancies);
    expect(policy.reproductiveContextPolicy).toContain('application');
    expect(policy.reproductiveContextPolicy).toContain('not a documented exclusion');
    for (const route of policy.profiles) {
      const profile = runtime.patientPointData.profiles.find(item => item.id === route.id);
      expect(profile.excludedCyclePhases).toEqual(pregnancies);
      expect(profile.provenance.reproductiveContextPolicy).toBe(policy.reproductiveContextPolicy);
      expect(profile.provenance.routingVersion).toBe(policy.version);
    }
  });

  it('dorosłe FDA nadal wyłącza wszystkie trymestry i zachowuje dotychczasową medianę', () => {
    for (const cyclePhase of pregnancies) {
      expect(evaluate(28, cyclePhase)).toEqual({ status: 'unavailable', reason: 'incompatible-reproductive-context' });
    }
    expect(evaluate(28)).toMatchObject({ status: 'ready', referenceValue: 27.27,
      profile: { id: 'fda2017-female-amh-age-26-under31' } });
  });

  it('zmienia wyłącznie kwalifikację pięciu profili i jej metadane, zachowując wszystkie źródłowe liczby', () => {
    const previous = { ...runtime.patientPointData, version: '2026-10-17.1',
      profiles: beforeFshCaliperBundle(runtime.patientPointData).profiles.map(profile => {
        if (!policy.profiles.some(route => route.id === profile.id)) return profile;
        const { excludedCyclePhases: _pregnancy, ...prior } = profile;
        const { reproductiveContextPolicy: _policy, ...provenance } = prior.provenance;
        return { ...prior, provenance: { ...provenance, routingVersion: '2026-10-13.1' } };
      }) };
    // Frozen complete patientPointData on audyt 596773283e4565d08b72b9a7cb28561159bf3196.
    expect(createHash('sha256').update(JSON.stringify(previous)).digest('hex'))
      .toBe('8ec2f54935bb534e98c7b549b3270e80d4612c743882cfcbffb6c73ef1ad08db');
    expect(runtime.patientPointData.profiles).toHaveLength(80);
  });
});
