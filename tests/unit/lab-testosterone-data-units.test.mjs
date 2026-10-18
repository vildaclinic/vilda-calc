import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const require = createRequire(import.meta.url);
const units = require('../../vilda_lab_testosterone_units.js');
const data = require('../../vilda_lab_testosterone_data.js');
const profile = data.profiles[0];
const ageRows = profile.rows.filter((row) => row.age);
const stageRows = profile.rows.filter((row) => row.stage);

describe('TT — niezależny rejestr jednostek i pochodzenie danych źródłowych', () => {
  it('udostępnia ten sam rejestr w Node i osobno w przeglądarce, bez silnika i norm', () => {
    const win = {};
    loadBrowserScript('vilda_lab_testosterone_units.js', win);
    expect(Object.keys(win)).toEqual(['VildaLabTestosteroneUnits']);
    expect(win.VildaLabTestosteroneUnits).toEqual(units);
    expect(units).toMatchObject({ id: 'tt-existing-mass-conversions', version: '1.0.0', canonicalUnit: 'nmol/L' });
    expect(Object.isFrozen(units)).toBe(true);
    expect(Object.isFrozen(units.factorToCanonical)).toBe(true);
    expect(() => { units.factorToCanonical['ng/dL'] = 1; }).toThrow(TypeError);
  });

  it('zachowuje wszystkie rzeczywiste współczynniki istniejącego przelicznika TT', () => {
    const win = {};
    loadBrowserScript('lab_units_data.js', win);
    const converter = win.LabUnitsData.find('testosterone_total');
    const existing = Object.fromEntries(converter.units.map((unit) => [unit.symbol, unit.factor_to_si]));
    expect(units.factorToCanonical).toEqual(existing);
    expect(units.factorToCanonical).toEqual({ 'nmol/L': 1, 'ng/dL': 0.03467, 'ng/mL': 3.467, 'pg/mL': 0.003467 });
  });

  it('ładuje dane niezależnie od rejestru jednostek i nie pozwala zmieniać norm w pamięci', () => {
    const win = {};
    loadBrowserScript('vilda_lab_testosterone_data.js', win);
    expect(Object.keys(win)).toEqual(['VildaLabTestosteroneData']);
    expect(win.VildaLabTestosteroneData).toEqual(data);
    expect(Object.isFrozen(data)).toBe(true);
    expect(Object.isFrozen(profile.rows)).toBe(true);
    expect(Object.isFrozen(profile.rows[0].bounds.lower)).toBe(true);
    expect(() => { profile.rows[0].bounds.lower.value = 0; }).toThrow(TypeError);
    expect(data).not.toHaveProperty('factorToCanonical');
    expect(profile.unit).toBe('ng/dL');
  });

  it('zachowuje ciągłe pokrycie źródłowych grup wieku, w tym przejście 18→19', () => {
    expect(ageRows.map((row) => row.age.lower.value)).toEqual([0, 0.5, 10, 12, 14, 15, 17, 19]);
    expect(ageRows.map((row) => row.age.upper?.value ?? null)).toEqual([0.5, 10, 12, 14, 15, 17, 19, null]);
    for (let index = 0; index < ageRows.length; index += 1) {
      const row = ageRows[index];
      expect(row.age.axis).toBe('chronologicalYears');
      expect(row.age.lower.operator).toBe('>=');
      if (row.age.upper) {
        expect(row.age.upper.operator).toBe('<');
        expect(row.age.upper.value).toBe(ageRows[index + 1].age.lower.value);
      }
    }
    expect(ageRows[0].bounds).toMatchObject({ lower: { operator: '>=', value: 75 }, upper: { operator: '<=', value: 400 } });
    expect(ageRows[6].bounds).toMatchObject({ lower: { value: 300 }, upper: { value: 1200 } });
    expect(ageRows[7].bounds).toMatchObject({ lower: { value: 240 }, upper: { value: 950 } });
  });

  it('nie zastępuje źródłowego <7 zerem, dokładnym progiem ani etykietą LoD/LoQ', () => {
    const censored = profile.rows.filter((row) => row.bounds.censoredLower);
    expect(censored).toHaveLength(5);
    for (const row of censored) {
      expect(row.bounds.lower).toBeNull();
      expect(row.bounds.censoredLower).toEqual({ operator: '<', value: 7, meaning: 'unspecified-source-lower-bound' });
      expect(row.bounds.sourceText).toMatch(/^<7–/);
    }
    expect(profile.method).not.toHaveProperty('analyticalSensitivity');
  });

  it('oddziela pięć źródłowych stadiów od zachowawczej polityki wieku aplikacji', () => {
    expect(stageRows.map((row) => row.stage.value)).toEqual([1, 2, 3, 4, 5]);
    expect(stageRows.every((row) => row.stage.kind === 'G' && !row.age)).toBe(true);
    expect(data.automaticReferencePolicy.stageAge).toMatchObject({ lower: { operator: '>=', value: 1 }, upper: { operator: '<', value: 19 } });
    expect(data.automaticReferencePolicy.infantAge).toMatchObject({ lower: { value: 0 }, upper: { operator: '<', value: 1 } });
    expect(data.automaticReferencePolicy.adultAge).toMatchObject({ lower: { operator: '>=', value: 19 }, upper: null });
    expect(data.automaticReferencePolicy.stageQualificationProvenance).toContain('polityka aplikacji');
    expect(stageRows[4].bounds).toMatchObject({ lower: { value: 300 }, upper: { value: 950 } });
  });

  it('zachowuje jeden męski profil Mayo i jawne ograniczenia metody oraz populacji', () => {
    expect(data.profiles.filter((candidate) => candidate.scope.sex === 'M')).toEqual([profile]);
    expect(data.automaticReferencePolicy.profileIds).toEqual([profile.id, 'mayo-ttst-female']);
    expect(profile).toMatchObject({ analyte: 'testosterone_total', sourceId: 'mayo-ttst-8533', material: 'serum', scope: { sex: 'M' } });
    expect(profile.rows.every((row) => row.sex === 'M')).toBe(true);
    const source = data.sources[profile.sourceId];
    expect(source.accessedOn).toBe('2026-10-15');
    expect(source.intervalEvidence.locator).toContain('Reference Values');
    expect(source.evidenceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(source.knownLimitations.join(' ')).toMatch(/liczebności.*Tanner Stages.*porannych.*GA\/PNA|liczebności.*Tanner Stages.*porannych.*pourodzeniowego/);
    expect(data.automaticReferencePolicy.blockKnownPretermInInfancy).toBe(true);
    expect(data.automaticReferencePolicy.unsupportedCollectionTimes).toEqual(['evening', 'midnight']);
  });

  it('nie używa wytycznych diagnostycznych jako dodatkowych profili referencyjnych', () => {
    const note = data.clinicalGuidance.adult;
    expect(note.sourceIds).toHaveLength(3);
    for (const id of note.sourceIds) {
      expect(data.sources[id]).toBeDefined();
      expect(data.sources[id].url).toMatch(/^https:\/\//);
      expect(data.profiles.some((candidate) => candidate.sourceId === id)).toBe(false);
    }
    expect(note.shortText).toContain('Pojedynczy wynik nie rozpoznaje ani nie wyklucza');
    expect(note.shortText).toContain('SHBG i wolny testosteron — gdy wskazane');
    expect(data.automaticReferencePolicy.confirmedBiochemicalAssessment).toBe(false);
  });

  it('dodaje wersjonowany profil żeński od 6 miesięcy bez tabeli Tanner lub zastępczej normy niemowlęcej', () => {
    const female = data.profiles.find((candidate) => candidate.id === 'mayo-ttst-female');
    expect(data).toMatchObject({ version: '1.1.0', dataVersion: '2026-10-15.2' });
    expect(data.profiles).toHaveLength(2);
    expect(profile.version).toBe('2026-10-15.1');
    expect(female).toMatchObject({ version: '2026-10-15.2', sourceId: 'mayo-ttst-8533-female',
      material: 'serum', unit: 'ng/dL', scope: { sex: 'F', age: { lower: { operator: '>=', value: 0.5 }, upper: null } } });
    expect(female.rows.every((row) => row.sex === 'F' && row.age && !row.stage)).toBe(true);
    expect(female.rows.map((row) => row.age.lower.value)).toEqual([0.5, 10, 12, 17, 19]);
    expect(female.rows.map((row) => row.age.upper?.value ?? null)).toEqual([10, 12, 17, 19, null]);
    expect(female.rows.map((row) => row.bounds.upper.value)).toEqual([20, 44, 75, 75, 60]);
    expect(female.rows.map((row) => row.bounds.lower?.value ?? null)).toEqual([null, null, null, 20, 8]);
    expect(female.rows.slice(0, 3).every((row) => row.bounds.censoredLower.operator === '<' && row.bounds.censoredLower.value === 7)).toBe(true);
    expect(female.rows.every((row) => row.age.lower.operator === '>=' && (!row.age.upper || row.age.upper.operator === '<'))).toBe(true);
    expect(data.automaticReferencePolicy.stageKindBySex).toEqual({ M: 'G' });
    expect(Object.isFrozen(female.rows[0].bounds.censoredLower)).toBe(true);
    const source = data.sources[female.sourceId];
    expect(source.accessedOn).toBe('2026-10-15');
    expect(source.intervalEvidence.locator).toContain('Females');
    expect(source.evidenceSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('utrzymuje żeńskie noty kliniczne i ich kwalifikację poza normami oraz silnikiem', () => {
    const female = data.clinicalGuidance.female;
    expect(female.androgenExcessAdult.threshold).toEqual({ operator: '>', value: 5, unit: 'nmol/L' });
    expect(female.androgenExcessAdult.age).toMatchObject({ lower: { operator: '>=', value: 19 }, upper: null });
    expect(female.androgenExcessAdult.ageQualificationProvenance).toContain('nie');
    expect(female.androgenExcessAdult.allowedSpecimens).toEqual(['unknown', 'serum']);
    expect(female.lowAdult.shortText).toContain('HSDD');
    for (const note of [female.androgenExcessAdult, female.lowAdult, female.aboveReference, female.withinReference]) {
      for (const id of note.sourceIds) {
        expect(data.sources[id]).toBeDefined();
        expect(data.sources[id].url).toMatch(/^https:\/\//);
        expect(data.profiles.some((candidate) => candidate.sourceId === id)).toBe(false);
      }
    }
    expect(data.automaticReferencePolicy.femaleContext).toMatchObject({ pregnancyRequiresSeparateProfile: true,
      blockedReproductiveContexts: ['pregnancy'], treatmentFlags: ['cocp', 'exogenousTestosterone'] });
  });

  it('zachowuje konserwatywną długość kalendarzowych miesięcy dla wieku znanego tylko w dniach', () => {
    const calendar = data.automaticReferencePolicy.postnatalCalendarAge;
    const spans = Array.from({ length: 12 }, () => []);
    for (const firstYear of [2023, 2024]) {
      for (let month = 0; month < 12; month += 1) {
        const monthDays = new Date(Date.UTC(firstYear, month + 1, 0)).getUTCDate();
        for (let day = 1; day <= monthDays; day += 1) {
          const birth = Date.UTC(firstYear, month, day);
          for (let offset = 0; offset < 12; offset += 1) {
            const lastDay = new Date(Date.UTC(firstYear, month + offset + 1, 0)).getUTCDate();
            const target = Date.UTC(firstYear, month + offset, Math.min(day, lastDay));
            spans[offset].push((target - birth) / 86400000);
          }
        }
      }
    }
    expect(calendar.minYearDays).toBe(365);
    expect(calendar.maxYearDays).toBe(366);
    expect(calendar.minMonthSpanDays).toEqual(spans.map((values) => Math.min(...values)));
    expect(calendar.maxMonthSpanDays).toEqual(spans.map((values) => Math.max(...values)));
    expect(calendar.minMonthSpanDays[6]).toBe(181);
    expect(calendar.maxMonthSpanDays[6]).toBe(184);
    expect(calendar.provenance).toContain('polityka aplikacji');
  });
});
