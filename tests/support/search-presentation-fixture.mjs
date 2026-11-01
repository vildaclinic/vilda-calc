import { expect } from '@playwright/test';
import { loadBrowserScript } from './load-browser-script.mjs';
import { clinicalFingerprint } from './centile-live-fixture.mjs';
import { globalSearchFixture } from './global-search-fixture.mjs';

export const GH_DOSE = 'Dawka: 0,028 mg/kg/d (0,70 mg/d).';
export const GH_RAW_DOSE = 0.028340080971659923;

// Generate real persisted records through the production clinical writers,
// using the same capture/serialize path as klirens-notes-view.test.mjs.
// Browser I/O uses the real encrypted, exclusively fictional fixture vault.
function calculationNotes(patientId) {
  const root = {};
  for (const file of ['clcr_clinical_safety.js', 'clcr_ca_dzm_reference_data.js', 'clcr_ca_dzm.js', 'clcr_ca_dzm_persistence.js',
    'clcr_acr_reference_data.js', 'clcr_acr.js', 'clcr_saved_calculation.js', 'clcr_saved_results.js']) loadBrowserScript(file, root);
  function persist(datapoint, values, comment) {
    const payload = root.ClcrSavedResults.buildPatientNotePayload(datapoint, { patientId, clinicalDateISO: '2026-10-28', comment });
    const capture = { formulaId: datapoint.sourceFormulaId, values, ageYears: Number(values.age) + Number(values.ageMonths || 0) / 12,
      fields: Object.keys(values).map(id => ({ id, label: id, type: 'text', required: ['CA_concentration', 'CA_volume', 'U_Alb', 'Ucr_spot'].includes(id) })) };
    const snapshot = root.ClcrSavedCalculation.createSnapshot(datapoint, { capture, clinicalDateISO: payload.clinicalDateISO });
    payload.body += '\n\n' + root.ClcrSavedCalculation.serializeSnapshot(snapshot, payload);
    expect(root.ClcrSavedCalculation.readSaved(payload).valid).toBe(true);
    return payload;
  }
  const caValues = { CA_inputMode: 'concentration', CA_concentration: '1.5', CA_concentrationUnit: 'mmol/L', CA_volume: '1430', CA_volumeUnit: 'mL',
    CA_collectionHours: '24', CA_clinicalMode: 'general', weight: '31', age: '10', ageMonths: '0', sex: 'M' };
  const ca = root.VildaClcrCaDzm.evaluate(root.VildaClcrCaDzm.inputFromValues(caValues), root.ClcrCaDzmReferenceData.DEFAULT_POLICY);
  const calcium = persist({ id: 'Ca_mgkg', testKey: 'clcr:Ca_mgkg', sourceFormulaId: 'Ca_mgkg', label: 'Wydalanie wapnia (DZM)',
    valueNum: ca.rawValue, rawValue: ca.rawValue, displayValue: ca.display.text, unit: ca.unit, norm: root.ClcrCaDzmPersistence.normText(ca),
    outOfRange: ca.outOfRange, tone: ca.tone === 'normal' ? 'success' : ca.tone,
    assessment: ({ low: 'below', high: 'above', boundary: 'above', 'criterion-met': 'above', within: 'within' })[ca.status] || 'unassessed',
    caDzmSnapshot: ca, interpretation: ca.interpretation }, caValues, 'Fikcyjny komentarz o zbiórce wapnia.');
  const acrValues = { age: '10', ageMonths: '0', U_Alb: '45', U_Alb_unit: 'mg/L', Ucr_spot: '100', Ucr_spot_unit: 'mg/dl', ACR_entry_mode: 'concentration' };
  const acrResult = root.VildaClcrAcr.evaluate({ ageYears: 10, albuminValue: '45', albuminUnit: 'mg/L', creatinineValue: '100', creatinineUnit: 'mg/dl' }, root.VildaClcrAcrReferenceData.getProfile('KDIGO_ACR_2024'));
  const acr = persist({ id: 'ACR', testKey: 'clcr:ACR', label: 'Albumina/kreatynina — ACR', sourceFormulaId: 'ACR', valueNum: acrResult.rawValue,
    displayValue: acrResult.display.value, unit: acrResult.unit, norm: '<30 mg/g', category: acrResult.category, tone: acrResult.tone,
    assessment: acrResult.status, outOfRange: true, acrSnapshot: acrResult.snapshot }, acrValues, 'Fikcyjny komentarz o badaniu ACR.');
  return { calcium: { ...calcium, title: 'Fikcyjny audyt wapnia' }, acr: { ...acr, title: 'Fikcyjny audyt ACR' },
    corrupted: { ...calcium, title: 'Fikcyjny audyt uszkodzonego zapisu', body: '[VILDA_CLCR_CALCULATION_V1]\n{broken\n[/VILDA_CLCR_CALCULATION_V1]' } };
}

export async function searchPresentationFixture(page) {
  const created = await globalSearchFixture(page);
  const payloads = calculationNotes(created.ids.a);
  const notes = await page.evaluate(async ({ patientId, calculations, dose, rawDose }) => {
    const specs = {
      gh: { patientId, category: 'treatment', title: 'Fikcyjny audyt leczenia rhGH', dueDateISO: '2027-01-15',
        body: 'Fikcyjna kontrola leczenia hormonem wzrostu.\nPreparat: Omnitrope 10 mg.\n' + dose + '\nMasa: 24,7 kg.',
        medication: { action: 'start', name: 'Omnitrope 10 mg', doseNum: rawDose, doseUnit: 'mg/kg/d', freq: 'dzień' } },
      ghNumeric: { patientId, category: 'treatment', title: 'Fikcyjny audyt liczbowej dawki rhGH', dueDateISO: '2027-01-15',
        body: 'Preparat: Omnitrope 10 mg.', medication: { action: 'start', name: 'Omnitrope 10 mg', doseNum: rawDose, doseUnit: 'mg/kg/d', freq: 'dzień' } },
      formatted: { patientId, category: 'lab-result', title: 'Fikcyjny audyt zwykłego wyniku', body: '', labResult: { test: 'Fikcyjny analit', value: '1,20', valueNum: 1.2, unit: 'mg/L' } },
      zero: { patientId, category: 'lab-result', title: 'Fikcyjny audyt wyniku zero', body: '', labResult: { test: 'Fikcyjny analit zerowy', value: '0', valueNum: 0, unit: 'mg/L' } },
      inequality: { patientId, category: 'lab-result', title: 'Fikcyjny audyt wyniku granicznego', body: '', labResult: { test: 'Fikcyjny analit graniczny', value: '<0,1', valueNum: 0.1, unit: 'mg/L' } },
      unavailableContext: { patientId, category: 'lab-result', title: 'Fikcyjny audyt niedostępnego kontekstu', body: '',
        labResult: { test: 'LH', value: '<0,1', valueNum: 0.1, unit: 'IU/L', assessment: null, hormoneReference: null } },
      ...calculations,
    };
    const saved = {};
    for (const [key, payload] of Object.entries(specs)) {
      saved[key] = (await window.VildaVault.savePatientNote(payload)).id;
      if (payload.medication) {
        const stored = await window.VildaVault.getPatientNote(saved[key]);
        if (stored.medication?.doseNum !== rawDose || stored.medication.doseUnit !== 'mg/kg/d' || stored.medication.freq !== 'dzień') {
          throw new Error('Fictional medication dose, unit and frequency must survive the real vault sanitizer');
        }
      }
      if (key === 'unavailableContext') {
        const stored = (await window.VildaVault.getPatientNote(saved[key])).labResult;
        if (!Object.prototype.hasOwnProperty.call(stored, 'assessment') || !Object.prototype.hasOwnProperty.call(stored, 'hormoneReference') ||
          stored.assessment?.status !== 'unavailable' || stored.hormoneReference?.status !== 'unavailable' || stored.value !== '<0,1') {
          throw new Error('Explicit unavailable result contexts and the censored result must survive the real vault normalizer');
        }
      }
    }
    return saved;
  }, { patientId: created.ids.a, calculations: payloads, dose: GH_DOSE, rawDose: GH_RAW_DOSE });
  // Stay on Start: opening a patient card could preload the Notes reader and
  // accidentally hide a broken Search lazy-loader. Finish the existing
  // compatibility refresh before taking the clinical fingerprint.
  await page.waitForTimeout(4500);
  return { ...created, presentationNotes: notes };
}

export async function presentationFingerprint(page, created) {
  const clinical = await clinicalFingerprint(created.frame, created.ids.a);
  const notes = await page.evaluate(async ids => Promise.all(ids.map(id => window.VildaVault.getPatientNote(id))), Object.values(created.presentationNotes));
  return { clinical, notes };
}
