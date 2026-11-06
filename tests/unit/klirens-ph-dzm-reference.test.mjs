import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
loadBrowserScript('clcr_ph_dzm_reference_data.js', browser);
const data = browser.VildaClcrPhDzmReferenceData;

describe('pH DZM — źródło, populacja i jawne ograniczenia danych normy', () => {
  it('udostępnia jeden niezmienny profil DZM z obu granicami włączonymi', () => {
    const policy = data.DEFAULT_POLICY;
    expect(policy.quantity).toBe('urine-ph-dzm');
    expect(policy.profiles).toHaveLength(1);
    expect(policy.profiles[0]).toMatchObject({ id: 'MAYO_UPH24', lower: 4.5, upper: 8, lowerInclusive: true, upperInclusive: true, unit: '', label: 'Norma ogólna', sample: 'Dobowa zbiórka moczu' });
    expect(Object.isFrozen(policy)).toBe(true);
    expect(Object.isFrozen(policy.profiles[0])).toBe(true);
    expect(data.getPolicy(policy.id)).toBe(policy);
    expect(data.getPolicy('PH_SPOT_MAYO_2026_10')).toBeNull();
  });

  it('niesie właściwe odnośniki i metodę źródła bez przypisywania jej pacjentowi', () => {
    const policy = data.DEFAULT_POLICY;
    expect(policy.sources.find(source => source.id === 'MAYO_UPH24')).toMatchObject({ url: 'https://www.mayocliniclabs.com/test-catalog/overview/606521', accessed: '2026-11-06', method: 'pH-metr' });
    expect(policy.sources.find(source => source.id === 'MAYO_UPH24_PEDIATRIC').url).toBe('https://pediatric.testcatalog.org/show/UPH24');
    expect(policy.population.label).toMatch(/bez podziału według wieku lub płci/);
    expect(policy.restrictions).toMatchObject({ patientMethodConfirmed: false, ageReferenceIntervalApplied: false, treatmentEfficacyAssessment: false, diagnosesRTA: false, diagnosesUTI: false, diagnosesStones: false, dosingAdviceAvailable: false, dailyExtrapolationAvailable: false });
  });

  it('oddziela próg kamicy dorosłych, łączny kontekst RTA i świeże próbki do monitorowania', () => {
    const notes = data.DEFAULT_POLICY.notes;
    expect(notes.stoneRisk).toMatch(/<5,5.*dorosłych/);
    expect(notes.rta).toMatch(/>6,2/);
    expect(notes.rta).toMatch(/>5,8/);
    expect(notes.rta).toMatch(/wykluczenia zakażenia/);
    expect(notes.therapy).toMatch(/świeżo oddany mocz o różnych porach dnia/);
    expect(notes.limitations).toMatch(/wcześniaków/);
    expect(notes.sample).toMatch(/Kwas borowy/);
    expect(notes.referenceLabel).toBe('Norma ogólna');
  });
});
