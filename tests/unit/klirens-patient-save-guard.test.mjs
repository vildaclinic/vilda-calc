import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Production workflow with only persisted I/O replaced. This is separate from
// clinical save fixtures so missing records, failed reads and races stay visible.
function harness({ document } = {}) {
  const patientId = 'fictional-saved-patient';
  const patients = new Map([[patientId, { id: patientId, patientId, name: 'Fikcyjny Pacjent' }]]);
  const state = { unlocked: true, account: 'fictional-account', reads: [], writes: [] };
  const lockListeners = [];
  const vault = {
    isUnlocked: () => state.unlocked,
    getCurrentUser: () => ({ userId: state.account }),
    getPatient: async id => { state.reads.push(id); return patients.get(id) || null; },
    savePatientNoteOnce: async payload => { state.writes.push(payload); return { id: payload.id, saved: true }; },
    onLock: callback => { lockListeners.push(callback); return () => {}; },
  };
  const global = { VildaVault: vault, ...(document ? { document } : {}) };
  loadBrowserScript('clcr_ui_workflow.js', global);
  const workflow = global.ClcrVisitSave;
  const datapoints = [workflow.mapDatapoint('egfr', 95)];
  const options = { clinicalDateISO: '2026-10-26', datapoints };
  function select(id = patientId) { workflow._setPatientId(id); }
  function lock() { state.unlocked = false; lockListeners.forEach(callback => callback()); }
  return { global, vault, state, patients, workflow, patientId, options, select, lock };
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

describe('Klirens — zapis wyłącznie do istniejącej wybranej karty pacjenta', () => {
  it.each(['45', '-'])('detects an incomplete specimen (%s) before a numeric result exists', value => {
    const controls = { U_Alb: { value }, age: { value: '10' } };
    const document = { readyState: 'loading', addEventListener() {},
      getElementById: id => controls[id] || null, querySelectorAll: () => [] };
    const h = harness({ document });
    h.global.ClcrUiWorkflow = { state: { activeFormulaId: 'ACR' },
      getCalculationFieldSpec: () => ({ fields: [
        { id: 'U_Alb', type: 'number' }, { id: 'age', type: 'number', historicalContext: true },
      ] }) };
    expect(h.workflow.hasUnsavedMeasurement()).toBe(true);
    expect(h.workflow.getPatientSaveState()).toMatchObject({ hasUnsavedMeasurement: true, status: 'none' });
    expect(h.state.writes).toEqual([]);
    controls.U_Alb.value = '';
    expect(h.workflow.hasUnsavedMeasurement()).toBe(false);
    controls.inactiveOtherAnalyte = { value: '90' };
    expect(h.workflow.hasUnsavedMeasurement()).toBe(false);
  });

  it('permits anonymous calculations but rejects a save even when a caller supplies a real patient ID', async () => {
    const h = harness();
    expect(h.options.datapoints[0].valueNum).toBe(95);
    expect(h.workflow.getPatientSaveState()).toMatchObject({ patientId: null, status: 'none' });
    const result = await h.workflow.saveActiveResultToCard({ ...h.options, patientId: h.patientId });
    expect(result).toMatchObject({ ok: false, reason: 'no-patient', saved: 0 });
    expect(h.state.writes).toEqual([]);
    expect(h.state.reads).toEqual([]);
  });

  it('rejects an explicit target different from the active patient before reading or writing', async () => {
    const h = harness(); h.select();
    const result = await h.workflow.saveActiveResultToCard({ ...h.options, patientId: 'fictional-other-patient' });
    expect(result).toMatchObject({ ok: false, reason: 'patient-mismatch', saved: 0 });
    expect(h.state.writes).toEqual([]);
    expect(h.state.reads).toEqual([]);
  });

  it.each([null, undefined, true, 42, 'fictional-invalid-record', {}, [], { id: 'fictional-saved-patient' }, { id: 'fictional-other-patient' }, { patientId: 'fictional-other-patient' }].map(value => [value]))(
    'rejects a missing or mismatched persisted record (%j)', async persisted => {
      const h = harness(); h.select(); h.vault.getPatient = async () => persisted;
      const result = await h.workflow.saveActiveResultToCard(h.options);
      expect(result).toMatchObject({ ok: false, reason: 'patient-unavailable', saved: 0 });
      expect(h.state.writes).toEqual([]);
      expect(h.workflow.getPatientSaveState().status).not.toBe('ready');
    }
  );

  it('cannot reuse an operation captured for a different patient', async () => {
    const h = harness(); h.select();
    const operation = h.workflow.createSaveOperation({ ...h.options, patientId: 'fictional-other-patient' });
    expect(await h.workflow.saveActiveResultToCard({ ...h.options, operation })).toMatchObject({ ok: false, reason: 'patient-mismatch', saved: 0 });
    expect(h.state.writes).toEqual([]);
    expect(h.state.reads).toEqual([]);
  });

  it('does not read patient records or write anything while the vault is locked', async () => {
    const h = harness(); h.select(); h.lock();
    expect(await h.workflow.ensurePersistedPatient()).toMatchObject({ ok: false, reason: 'locked' });
    expect(await h.workflow.saveActiveResultToCard(h.options)).toMatchObject({ ok: false, reason: 'locked', saved: 0 });
    expect(h.workflow.getPatientSaveState()).toMatchObject({ status: 'locked' });
    expect(h.state.reads).toEqual([]);
    expect(h.state.writes).toEqual([]);
  });

  it('fails closed when persistent patient lookup is unavailable', async () => {
    const h = harness(); h.select(); delete h.vault.getPatient;
    expect(await h.workflow.saveActiveResultToCard(h.options)).toMatchObject({ ok: false, reason: 'patient-unavailable', saved: 0 });
    expect(h.state.writes).toEqual([]);
  });

  it('keeps the failure distinguishable and allows retry after a failed read', async () => {
    const h = harness(); h.select();
    const read = h.vault.getPatient;
    h.vault.getPatient = async () => { throw new Error('Fikcyjny błąd odczytu'); };
    expect(await h.workflow.ensurePersistedPatient()).toMatchObject({ ok: false, reason: 'patient-unavailable' });
    expect(h.workflow.getPatientSaveState()).toMatchObject({ status: 'error' });
    h.vault.getPatient = read;
    h.workflow.notifyPatientRecordChanged();
    expect(await h.workflow.ensurePersistedPatient({ force: true })).toMatchObject({ ok: true, patientId: h.patientId });
    expect(h.workflow.getPatientSaveState()).toMatchObject({ status: 'ready', patientName: 'Fikcyjny Pacjent' });
    expect(h.state.writes).toEqual([]);
    expect(await h.workflow.saveActiveResultToCard(h.options)).toMatchObject({ ok: true, saved: 1, patientId: h.patientId });
  });

  it('shows a checking state and cannot write before the persisted read completes', async () => {
    const h = harness(); h.select(); const pending = deferred();
    h.vault.getPatient = () => pending.promise;
    const saving = h.workflow.saveActiveResultToCard(h.options);
    expect(h.workflow.getPatientSaveState()).toMatchObject({ status: 'checking', patientId: h.patientId });
    expect(h.state.writes).toEqual([]);
    pending.resolve(h.patients.get(h.patientId));
    expect(await saving).toMatchObject({ ok: true, saved: 1, patientId: h.patientId });
    expect(h.state.writes).toHaveLength(1);
    expect(h.state.writes[0]).toMatchObject({ patientId: h.patientId, clinicalDateISO: '2026-10-26', category: 'wynik-klirens' });
  });

  it.each(['patient', 'account', 'vault', 'lock'])('rejects a %s change while checking persistence', async change => {
    const h = harness(); h.select(); const pending = deferred();
    h.vault.getPatient = () => pending.promise;
    const saving = h.workflow.saveActiveResultToCard(h.options);
    if (change === 'patient') h.select('fictional-other-patient');
    if (change === 'account') h.state.account = 'fictional-other-account';
    if (change === 'vault') h.global.VildaVault = { ...h.vault };
    if (change === 'lock') h.lock();
    pending.resolve(h.patients.get(h.patientId));
    expect(await saving).toMatchObject({ ok: false, reason: 'context-changed', saved: 0 });
    expect(h.state.writes).toEqual([]);
  });

  it('does not accept a stale read after active patient A → B → A', async () => {
    const h = harness(); h.select(); const pending = deferred();
    h.vault.getPatient = () => pending.promise;
    const checking = h.workflow.ensurePersistedPatient({ force: true });
    h.select('fictional-other-patient'); h.select();
    pending.resolve(h.patients.get(h.patientId));
    expect(await checking).toMatchObject({ ok: false, reason: 'context-changed' });
    expect(h.workflow.getPatientSaveState().status).not.toBe('ready');
    expect(h.state.writes).toEqual([]);
  });

  it('rechecks persistence at save time after an earlier successful UI check', async () => {
    const h = harness(); h.select();
    expect(await h.workflow.ensurePersistedPatient()).toMatchObject({ ok: true });
    h.patients.delete(h.patientId);
    expect(await h.workflow.saveActiveResultToCard(h.options)).toMatchObject({ ok: false, reason: 'patient-unavailable', saved: 0 });
    expect(h.state.reads).toEqual([h.patientId, h.patientId]);
    expect(h.state.writes).toEqual([]);
  });

  it('retains original target after the first real write starts despite a later patient switch', async () => {
    const h = harness(); h.select(); const pending = deferred();
    h.vault.savePatientNoteOnce = async payload => { h.state.writes.push(payload); await pending.promise; return { id: payload.id, saved: true }; };
    const saving = h.workflow.saveActiveResultToCard(h.options);
    await expect.poll(() => h.state.writes.length).toBe(1);
    h.select('fictional-other-patient');
    pending.resolve();
    expect(await saving).toMatchObject({ ok: true, patientId: h.patientId });
    expect(h.state.writes).toHaveLength(1);
    expect(h.state.writes[0].patientId).toBe(h.patientId);
  });
});
