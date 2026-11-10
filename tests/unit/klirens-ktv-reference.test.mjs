import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = loadBrowserScript('clcr_ktv_reference_data.js');
const data = browser.VildaClcrKtvReferenceData;
const policy = data.DEFAULT_POLICY;

describe('KTV — wersjonowane źródła, populacje i pełna macierz GFAC', () => {
  it('ma jednoznaczny stabilny identyfikator polityki i serializację JSON', () => {
    expect(policy).toMatchObject({ id: 'KTV_SESSION_2026_11', version: 1, quantity: 'maintenance-ihd-session-dose' });
    expect(data.getPolicy(policy.id)).toBe(policy);
    expect(data.getPolicy('unknown')).toBeNull();
    expect(JSON.parse(JSON.stringify(policy))).toEqual(policy);
    for (const part of [policy, policy.gfac, policy.gfac[7], policy.profiles, policy.profiles[0], policy.sources, policy.sources[0]]) expect(Object.isFrozen(part)).toBe(true);
  });
  it('zawiera dokładnie 12 komórek źródłowej tabeli; 7/PIDI2 to 0,0175', () => {
    expect(Object.values(policy.gfac).reduce((count, row) => count + Object.keys(row).length, 0)).toBe(12);
    expect(policy.gfac).toEqual({ 2: { 3: .0055, 4: .0045 }, 3: { 2: .008, 3: .006 }, 4: { 1: .0155, 2: .009 }, 5: { 1: .0175, 2: .0095 }, 6: { 1: .0175, 2: .0095 }, 7: { 1: .0175, 2: .0175 } });
    expect(policy.notes.gfac).toMatch(/od początku poprzedniej dializy do początku ocenianej/);
  });
  it('oddziela Tattersalla i źródło stałych AV/CVC od wzoru Daugirdasa', () => {
    expect(policy.calculation.reboundMinutes).toEqual({ AVF_AVG: 35, CVC: 22 });
    expect(policy.notes.formulaE).toMatch(/Tattersalla/);
    expect(policy.sources.find(source => source.id === 'TATTERSALL_1996')).toMatchObject({ doi: '10.1038/ki.1996.534' });
    expect(policy.sources.find(source => source.id === 'UKRA_2019').evidence).toMatch(/35.*22/);
  });
  it.each(policy.profiles)('$id ma własne źródło, populację i prawidłowo uporządkowane progi', profile => {
    expect(profile.population).toBeTruthy();
    expect(profile.sourceIds.length).toBeGreaterThan(0);
    for (const id of profile.sourceIds) expect(policy.sources.some(source => source.id === id)).toBe(true);
    expect(profile.minimum).toBeGreaterThan(0);
    if (profile.target !== null) expect(profile.target).toBeGreaterThanOrEqual(profile.minimum);
  });
  it('nie nadaje dorosłego celu dzieciom lub nieznanemu wiekowi i nie udaje pełnej walidacji', () => {
    const pediatric = policy.profiles.filter(profile => profile.minimumAgeYears < 18);
    expect(pediatric).toHaveLength(1);
    expect(pediatric[0]).toMatchObject({ variant: 'spktv', minimumAgeYears: 2, maximumAgeYearsExclusive: 18, sessionsPerWeek: 3, pidiDays: 2, minimum: 1.2, target: null });
    expect(policy.restrictions).toMatchObject({ pediatricWholeGfacMatrixValidated: false, adultReboundEstimateValidatedInChildren: false, localAgeBoundaryIsGuidelineProhibition: false, renalContributionAdded: false, unknownRenalFunctionAssumedZero: false, samplingAssumptionIsConfirmation: false, weeklyAdequacyAssessment: false });
  });
  it('oznacza konserwatywne progi jako reguły aplikacji, nie źródłowe przeciwwskazania', () => {
    expect(policy.guards).toMatchObject({ highUrrExclusive: 88, longSessionHighUrrExclusive: 82, longSessionMinutesExclusive: 300, frequentSessionsAtLeast: 5, frequentSessionsAtMost: 7, frequentLongMinutesExclusive: 300, localConservativePolicy: true });
    expect(policy.notes.localGuards).toMatch(/nie jest źródłową definicją/);
    expect(policy.sources.find(source => source.id === 'DAUGIRDAS_2013').evidence).toMatch(/symulacji/);
  });
});
