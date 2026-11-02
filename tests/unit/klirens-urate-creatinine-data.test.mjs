import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function load() {
  const browser = {};
  loadBrowserScript('clcr_urate_creatinine_data.js', browser);
  loadBrowserScript('clcr_urate_creatinine.js', browser);
  return { data: browser.ClcrUrateCreatinineReferenceData, engine: browser.VildaClcrUrateCreatinine };
}

describe('KM/Cr — one explicit Newcastle random-urine reference policy', () => {
  it('keeps the original five source groups and numerical values separate from the engine', () => {
    const { data, engine } = load(), policy = data.DATA;
    expect(policy.profiles.map(row => [row.ageLower, row.ageUpper, row.lower, row.upper, row.sourceAgeLabel])).toEqual([
      [0, 2, 0.42, 1.53, 'Up to 2 years'], [2, 6, 0.57, 1.35, '2 to 5 years'], [6, 10, 0.39, 0.85, '6 to 9 years'],
      [10, 18, 0.15, 0.67, '10 to17 years'], [18, null, 0.11, 0.53, '>17 years'],
    ]);
    expect(policy).toMatchObject({ quantity: 'urinary-urate-creatinine-ratio', specimen: 'random', unit: 'mmol/mmol', version: 1 });
    expect(engine.validPolicy(policy)).toBe(true);
    expect(data.DEFAULT_POLICY).toBe(policy); expect(data.POLICY).toBe(policy);
  });
  it('attributes the exact published source and distinguishes application conventions', () => {
    const { data } = load(), policy = data.DATA;
    expect(policy.sources).toEqual([expect.objectContaining({
      id: data.SOURCE_ID, url: 'https://laboratories.newcastle-hospitals.nhs.uk/test-directory/urate-urine/',
      updated: '2024-12-24', accessed: '2026-11-01', locator: 'Reference ranges — Random urine sample',
    })]);
    expect(policy.agePolicy).toContain('jawna konwencja'); expect(policy.agePolicy).toContain('2 lata');
    expect(policy.endpointPolicy).toContain('Obie liczbowe granice');
    expect(policy.population.limitations).toContain('nie opisuje');
    expect(policy.profiles.every(row => row.lowerInclusive && row.upperInclusive && row.ageLowerInclusive && !row.ageUpperInclusive && row.unit === 'mmol/mmol' && row.specimen === 'random')).toBe(true);
  });
  it('freezes reference values, population metadata, source and clinical copy', () => {
    const { data } = load();
    expect(Object.isFrozen(data.DATA)).toBe(true); expect(Object.isFrozen(data.DATA.profiles[0])).toBe(true);
    expect(Object.isFrozen(data.DATA.profiles[0].copy)).toBe(true);
    expect(() => { data.DATA.profiles[0].upper = 999; }).toThrow(TypeError);
  });
  it('retains only the accepted high-result sentence after the owner correction', () => {
    const { data } = load();
    for (const row of data.DATA.profiles) expect(row.copy.high).toBe('Podwyższony KM/Cr może wskazywać na zwiększone wydalanie kwasu moczowego.');
    expect(JSON.stringify(data)).not.toContain('Sam wynik nie rozpoznaje kamicy ani nie zastępuje oceny dobowego wydalania.');
    expect(data.DATA.notes.timedTitle).toBe('Brak normy DZM w aplikacji');
  });
});
