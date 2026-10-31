import {describe, expect, it} from 'vitest';
import {loadBrowserScript} from '../support/load-browser-script.mjs';

const window={};loadBrowserScript('clcr_potassium_dzm_data.js',window);
const data=window.ClcrPotassiumDzmReferenceData, policy=data.DEFAULT_POLICY;

describe('potassium DZM reference data — approved Labcorp 003186 transcription', () => {
  it('keeps all approved sex-specific source ranges separate from engine code', () => {
    expect(policy.quantity).toBe('potassium-excretion');
    expect(policy.profiles.map(({ageLower,ageUpper,sex,lower,upper,sourceAgeLabel})=>[ageLower,ageUpper,sex,lower,upper,sourceAgeLabel])).toEqual([
      [6,18,'M',11,88,'6 to 17 y'],[6,18,'F',10,70,'6 to 17 y'],
      [18,81,'M',20,116,'18 to 80 y'],[18,81,'F',14,95,'18 to 80 y'],
      [81,null,'M',16,83,'>80 y'],[81,null,'F',6,67,'>80 y']
    ]);
    expect(policy.profiles.every(profile=>profile.lowerInclusive&&profile.upperInclusive&&profile.ageLowerInclusive&&!profile.ageUpperInclusive&&profile.unit==='mmol/24 h')).toBe(true);
    expect(policy.referenceGroups[0]).toEqual({id:'young',label:'0–5 lat',maleProfile:null,femaleProfile:null});
  });
  it('makes app age and endpoint conventions explicit without claiming source precision', () => {
    expect(policy.agePolicy).toContain('konwencja aplikacji');expect(policy.agePolicy).toContain('Labcorp nie definiuje precyzji wieku');
    expect(policy.profiles[0].explanation).toContain('oba końce');
    expect(policy.population.limitations).toContain('nie podaje liczebności');
    const labcorp=policy.sources.find(source=>source.id==='LABCORP_003186_2026_10_30');
    expect(labcorp).toMatchObject({accessed:'2026-10-30',url:'https://www.labcorp.com/tests/003186/potassium-24-hour-urine?letter=M'});
    expect(labcorp.locator).toContain('>80 y M16–83/F6–67');
    expect(policy.profiles.every(profile=>profile.sourceId===labcorp.id)).toBe(true);
  });
  it('documents limits and conditional clinical context without diagnostic cutoffs', () => {
    expect(policy.notes.belowAge).toContain('poniżej 6 lat');
    expect(policy.notes.limitations).toContain('Przy hipokaliemii');
    expect(policy.notes.limitations).toContain('nie potwierdza prawidłowego stężenia potasu we krwi');
    expect(policy.notes.conversion).toContain('liczbowo równe');
    expect(policy.notes.sections.flatMap(section=>section.paragraphs).join(' ')).not.toMatch(/(?:15|20|30|40)\s*(?:mmol|mEq)/);
  });
  it('deep-freezes versioned policy, sources and narrative', () => {
    expect(data.getPolicy()).toBe(policy);expect(policy.version).toBe(1);
    for (const value of [data,policy,policy.profiles,policy.profiles[0],policy.sources[0],policy.notes.sections[0].paragraphs]) expect(Object.isFrozen(value)).toBe(true);
  });
});
