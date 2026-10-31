import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const copy = value => JSON.parse(JSON.stringify(value));
const PATIENT = 'fictional-potassium-volume-identity';
const standard = { K_inputMode: 'concentration', K_concentration: '100', K_volume: '1500', K_volumeUnit: 'mL',
  K_reportedValue: '', K_reportedUnit: 'mmol/24h', K_outputUnit: 'mmol/24h', K_collectionHours: '24',
  K_collectionSource: 'hours', K_durationNeedsConfirmation: false, K_unitConversions: '',
  age: '40', sex: 'M', Cl24CollectionProblem: false, ui_collectionNoMissedVoids_answer: 'unknown' };
function harness(patch = {}) {
  const controls = Object.fromEntries(Object.entries({ ...standard, ...patch }).map(([id, value]) => [id, {
    id, value: typeof value === 'boolean' ? '' : String(value), checked: value === true,
    type: typeof value === 'boolean' ? 'checkbox' : ['K_concentration', 'K_volume', 'K_reportedValue', 'K_collectionHours'].includes(id) ? 'number' : ['K_inputMode', 'K_volumeUnit', 'K_reportedUnit', 'K_outputUnit', 'sex'].includes(id) ? 'select' : 'hidden',
  }]));
  const fields = Object.values(controls).map(control => ({ id: control.id, label: control.id, type: control.type, historicalContext: ['age', 'sex'].includes(control.id) }));
  const form = { querySelectorAll: () => Object.values(controls).filter(control => control.type === 'number') };
  const document = { readyState: 'loading', addEventListener() {}, querySelectorAll: () => [],
    getElementById: id => id === 'clcrForm' ? form : controls[id] || null };
  const locked = {}; loadBrowserScript('vilda_vault.js', locked);
  const notes = new Map(), writes = [];
  const w = { document, VildaVault: { isUnlocked: () => true, getCurrentUser: () => ({ userId: 'fictional-volume-account' }),
    getPatient: async id => ({ id, patientId: id, name: 'Fikcyjny Pacjent' }), getPatientNote: async id => copy(notes.get(id)),
    savePatientNoteOnce: async payload => {
      writes.push(copy(payload)); notes.set(payload.id, { ...copy(payload), rev: 1,
        body: locked.VildaVault.sanitizeNoteText(payload.body), labResult: locked.VildaVault.sanitizeLabResult(payload.labResult) });
      return { id: payload.id, saved: true };
    }, sanitizeNoteText: locked.VildaVault.sanitizeNoteText, sanitizeLabResult: locked.VildaVault.sanitizeLabResult,
  } };
  for (const file of ['clcr_potassium_dzm_data.js', 'clcr_potassium_dzm.js', 'clcr_potassium_dzm_persistence.js', 'clcr_saved_calculation.js', 'clcr_ui_workflow.js']) loadBrowserScript(file, w);
  w.ClcrUiWorkflow = { state: { activeFormulaId: 'K_mmol_d' }, getCalculationFieldSpec: () => ({ formulaId: 'K_mmol_d', fieldIds: Object.keys(controls), fields }) };
  const workflow = w.ClcrVisitSave; workflow._setPatientId(PATIENT);
  const values = () => Object.fromEntries(Object.entries(controls).map(([id, control]) => [id, control.type === 'checkbox' ? control.checked : control.value]));
  function set(patch) { for (const [id, value] of Object.entries(patch)) { if (controls[id].type === 'checkbox') controls[id].checked = value; else controls[id].value = String(value); } }
  function datapoint() {
    const result = w.VildaClcrPotassiumDzm.evaluate(w.VildaClcrPotassiumDzm.inputFromValues(values()), w.ClcrPotassiumDzmReferenceData.DEFAULT_POLICY);
    expect(result.valid).toBe(true);
    const dp = { id: 'K_mmol_d', sourceFormulaId: 'K_mmol_d', label: 'Wydalanie potasu (DZM)' };
    w.ClcrPotassiumDzmPersistence.augmentDatapoint({ getAttribute: key => key === 'data-clcr-potassium-dzm-snapshot' ? JSON.stringify(result) : null }, dp);
    dp.capture = workflow.captureCalculationFields('K_mmol_d', { root: document }); return dp;
  }
  function convert() {
    const before = values(), converted = w.VildaClcrPotassiumDzm.convertUnitInput(before.K_volume, before.K_volumeUnit, 'L', 'volume');
    expect(converted.ok).toBe(true);
    set({ K_volume: converted.text, K_volumeUnit: 'L', K_unitConversions: JSON.stringify({ volume: { originalValue: before.K_volume, originalUnit: before.K_volumeUnit, convertedValue: converted.text, convertedUnit: 'L' } }) });
  }
  const options = dp => ({ clinicalDateISO: workflow.todayISO(), datapoints: [dp || datapoint()] });
  return { w, workflow, controls, notes, writes, locked, set, values, datapoint, convert, options };
}

describe('K saved operation normalizes only its exact volume representation', () => {
  it.each(['1500', '1500.0000000000000000001', '0.000000000001'])('reuses a saved receipt across mL/L for %s without rewriting original source fields', async volume => {
    const h = harness({ K_volume: volume }), originalDp = h.datapoint(), original = copy(originalDp);
    const originalKey = h.workflow.createSaveOperation(h.options(originalDp)).key;
    const first = await h.workflow.saveActiveResultToCard(h.options(originalDp));
    expect(first.ok).toBe(true); expect(h.workflow.hasUnsavedMeasurement()).toBe(false);
    const note = copy([...h.notes.values()][0]); h.convert();
    const next = h.datapoint(); expect(next.potassiumDzmSnapshot.exactMain).toEqual(originalDp.potassiumDzmSnapshot.exactMain);
    expect(h.workflow.createSaveOperation(h.options(next)).key).toBe(originalKey);
    expect(h.workflow.hasUnsavedMeasurement()).toBe(false);
    expect(await h.workflow.saveActiveResultToCard(h.options(next))).toEqual(first);
    expect(h.writes).toHaveLength(1); expect([...h.notes.values()]).toEqual([note]);
    expect(h.w.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: true, inputs: { K_volume: volume, K_volumeUnit: 'mL' } });
    expect(originalDp).toEqual(original); expect(h.locked.VildaVault.isUnlocked()).toBe(false);
  });
  it('keeps a compensated concentration/volume edit distinct even when the final quantity is identical', async () => {
    const h = harness(), firstDp = h.datapoint(), first = await h.workflow.saveActiveResultToCard(h.options(firstDp));
    h.set({ K_volume: '2', K_volumeUnit: 'L', K_concentration: '75', K_unitConversions: '' });
    const changed = h.datapoint(); expect(changed.valueNum).toBe(firstDp.valueNum);
    expect(h.workflow.hasUnsavedMeasurement()).toBe(true);
    const second = await h.workflow.saveActiveResultToCard(h.options(changed));
    expect(second.noteIds).not.toEqual(first.noteIds); expect(h.writes).toHaveLength(2);
  });
  it.each([
    { K_concentration: '101' }, { K_volume: '2', K_unitConversions: '' }, { K_collectionHours: '12' },
    { K_collectionSource: 'captured' }, { K_reportedValue: '150' }, { age: '41' }, { sex: 'F' }, { ui_collectionNoMissedVoids_answer: 'yes' },
    { K_inputMode: 'reported', K_reportedValue: '150' },
  ])('keeps the other captured values meaningful: %j', async patch => {
    const h = harness(), initial = h.datapoint(), originalKey = h.workflow.createSaveOperation(h.options(initial)).key;
    await h.workflow.saveActiveResultToCard(h.options(initial)); h.convert(); h.set(patch);
    expect(h.workflow.hasUnsavedMeasurement()).toBe(true);
    expect(h.workflow.createSaveOperation(h.options()).key).not.toBe(originalKey);
  });
  it('does not suppress a real decimal volume edit whose binary Number stayed the same', async () => {
    const h = harness(), initial = h.datapoint(); await h.workflow.saveActiveResultToCard(h.options(initial)); h.convert();
    h.set({ K_volume: '1.50000000000000000001', K_unitConversions: '' });
    const changed = h.datapoint(); expect(changed.valueNum).toBe(initial.valueNum);
    expect(changed.potassiumDzmSnapshot.exactVolumeLitres).not.toEqual(initial.potassiumDzmSnapshot.exactVolumeLitres);
    expect(h.workflow.hasUnsavedMeasurement()).toBe(true);
    expect(h.workflow.createSaveOperation(h.options(changed)).key).not.toBe(h.workflow.createSaveOperation(h.options(initial)).key);
  });
  it('does not hide invalid collection facts, stale provenance or a malformed conversion field', async () => {
    const h = harness(); await h.workflow.saveActiveResultToCard(h.options()); h.convert();
    const converted = h.values();
    for (const patch of [{ Cl24CollectionProblem: true }, { ui_collectionNoMissedVoids_answer: 'no' },
      { K_volume: '2' }, { K_unitConversions: '{invalid-json' }, { K_unitConversions: '{"unrecognized":true}' }]) {
      h.set({ ...converted, ...patch }); expect(h.workflow.hasUnsavedMeasurement()).toBe(true);
    }
  });
  it('retains patient and date identity and does not normalize a different formula', () => {
    const h = harness(), dp = h.datapoint(), first = h.workflow.createSaveOperation(h.options(dp)); h.convert();
    const next = h.datapoint();
    expect(h.workflow.createSaveOperation({ ...h.options(next), clinicalDateISO: '2020-01-01' }).key).not.toBe(first.key);
    expect(h.workflow.createSaveOperation({ ...h.options(next), patientId: 'fictional-other-patient' }).key).not.toBe(first.key);
    const differentContext = { ...next, capture: { ...next.capture, sourceContext: { fictionalContext: 'changed' } } };
    expect(h.workflow.createSaveOperation(h.options(differentContext)).key).not.toBe(first.key);
    const a = { ...dp, sourceFormulaId: 'Na_mmol_d' }, b = { ...next, sourceFormulaId: 'Na_mmol_d' };
    expect(h.workflow.createSaveOperation(h.options(a)).key).not.toBe(h.workflow.createSaveOperation(h.options(b)).key);
  });
});
