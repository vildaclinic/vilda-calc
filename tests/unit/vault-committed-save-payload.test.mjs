import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const PASSWORD = 'Fictional#Commit!2026Aa';
function storage() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key),
    key: index => [...data.keys()][index] ?? null, get length() { return data.size; } };
}
async function device() {
  const win = { crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: storage(), sessionStorage: storage(), setTimeout, clearTimeout,
    addEventListener() {}, removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false } };
  win.window = win; win.self = win; win.top = win;
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_vault.js', win);
  const vault = win.VildaVault, adapter = vault.createInMemoryAdapter();
  vault.setStorageAdapter(adapter);
  await vault.createUser(PASSWORD, { label: 'Fictional committed-payload tests', iterations: 10000 });
  return { win, vault, adapter };
}
function payload(height = 130, ages = [60]) {
  return { name: 'Fikcyjny Pacjent Zapisu',
    user: { firstName: 'Fikcyjny', lastName: 'Pacjent Zapisu', sex: 'M', dobISO: '2016-05-01',
      age: 10, ageMonths: 6, height, weight: 30 },
    birth: { weeks: '38', days: '0', assessment: { inputs: { weeks: 38, days: 0 }, computedAtISO: '2026-11-01T10:00:00.000Z' } },
    advanced: { data: { measurements: ages.map(ageMonths => ({ ageMonths, ageYears: ageMonths / 12,
      height: 90 + ageMonths / 2, weight: 12 + ageMonths / 6 })) } } };
}
async function storedPayload(vault, result) {
  const patient = await vault.getPatient(result.patientId);
  return patient.snapshots.find(row => row.snapshotId === result.snapshotId).payload;
}

describe('Vault exact committed save payload without a second history read', () => {
  it('binds the exact encrypted payload before callbacks, despite later nested caller mutations', async () => {
    const { vault, adapter } = await device(), input = payload();
    const put = adapter.putSnapshotForUser.bind(adapter);
    adapter.putSnapshotForUser = async (...args) => {
      input.user.height = 191;
      input.birth.assessment.inputs.days = 6;
      return put(...args);
    };
    let callbackResult, callbackPayload;
    vault.onPatientSaved(result => {
      callbackResult = result;
      callbackPayload = vault.getCommittedSavePayload(result);
      input.user.height = 192;
      input.advanced.data.measurements.length = 0;
    });
    const result = await vault.savePatient(input, { dedup: false });
    expect(callbackResult).toBe(result);
    const committed = vault.getCommittedSavePayload(result);
    expect(committed).toEqual(await storedPayload(vault, result));
    expect(committed).toEqual(callbackPayload);
    expect(committed.user.height).toBe(130);
    expect(committed.birth.assessment.inputs.days).toBe(0);
    expect(committed.advanced.data.measurements).toHaveLength(1);
    expect(committed._contentAtISO).toBe(result.savedAtISO);
    expect(committed._pinnedState).toMatchObject({ pin: false, at: null });
    expect(Object.keys(result)).not.toContain('payload');
    committed.user.height = 193;
    callbackPayload.birth.assessment.inputs.days = 5;
    expect(vault.getCommittedSavePayload(result).user.height).toBe(130);
    expect(vault.getCommittedSavePayload(result).birth.assessment.inputs.days).toBe(0);
  });

  it('keeps K2: one history read for an existing save and none for repeated payload retrieval', async () => {
    const { vault, adapter, win } = await device();
    const initial = await vault.savePatient(payload(), { dedup: false });
    let histories = 0, decrypts = 0;
    const list = adapter.listSnapshotsForUser.bind(adapter), decrypt = win.VildaCrypto.decryptString;
    adapter.listSnapshotsForUser = (...args) => { histories += 1; return list(...args); };
    win.VildaCrypto.decryptString = (...args) => { decrypts += 1; return decrypt(...args); };
    const result = await vault.savePatient(payload(131), { patientId: initial.patientId, dedup: false });
    expect(histories).toBe(1);
    const afterSave = decrypts;
    expect(vault.getCommittedSavePayload(result).user.height).toBe(131);
    expect(vault.getCommittedSavePayload(result).user.height).toBe(131);
    expect(histories).toBe(1);
    expect(decrypts).toBe(afterSave);
  });

  it('selects each actual snapshot, including patient-identity dedup, rather than the newest head', async () => {
    const { vault } = await device();
    const first = await vault.savePatient(payload(130));
    const second = await vault.savePatient(payload(132));
    expect(second.patientId).toBe(first.patientId);
    expect(second.isNew).toBe(false);
    expect(second.snapshotId).not.toBe(first.snapshotId);
    expect(vault.getCommittedSavePayload(first)).toEqual(await storedPayload(vault, first));
    expect(vault.getCommittedSavePayload(second)).toEqual(await storedPayload(vault, second));
    expect(vault.getCommittedSavePayload(first).user.height).toBe(130);
    expect(vault.getCommittedSavePayload(second).user.height).toBe(132);
  });

  it('preserves rows accepted from the current record, not just the original submitted form', async () => {
    const { vault } = await device(), baseline = payload(130, [60]);
    const first = await vault.savePatient(clone(baseline), { dedup: false });
    await vault.savePatient(payload(131, [60, 66]), { patientId: first.patientId, dedup: false });
    vault.setSaveConflictResolver(() => 'scal');
    const result = await vault.savePatient(payload(132, [60]), {
      patientId: first.patientId, dedup: false, baselinePayload: baseline,
    });
    expect(result.scalonoZBazy).toBeGreaterThan(0);
    const committed = vault.getCommittedSavePayload(result);
    expect(committed).toEqual(await storedPayload(vault, result));
    expect(committed.advanced.data.measurements.map(row => row.ageMonths).sort((a, b) => a - b)).toEqual([60, 66]);
  });

  it('rejects forged/cross-frame results and changed receipt selectors without leaking a reference', async () => {
    const { vault } = await device(), other = await device();
    const result = await vault.savePatient(payload(), { dedup: false });
    for (const candidate of [null, undefined, false, 'save', {}, clone(result)]) {
      expect(vault.getCommittedSavePayload(candidate)).toBeNull();
    }
    expect(other.vault.getCommittedSavePayload(result)).toBeNull();
    const snapshotId = result.snapshotId;
    result.snapshotId = 'fictional-forged-snapshot';
    expect(vault.getCommittedSavePayload(result)).toBeNull();
    result.snapshotId = snapshotId;
    const patientId = result.patientId;
    result.patientId = 'fictional-forged-patient';
    expect(vault.getCommittedSavePayload(result)).toBeNull();
    result.patientId = patientId;
    expect(vault.getCommittedSavePayload(result).user.height).toBe(130);
  });

  it('invalidates old results on lock, same-account relogin and account changes', async () => {
    const { vault } = await device();
    const owner = vault.getCurrentUser().userId;
    const result = await vault.savePatient(payload(), { dedup: false });
    vault.lock('fictional-test-lock');
    expect(vault.getCommittedSavePayload(result)).toBeNull();
    await vault.unlockUser(owner, PASSWORD);
    expect(vault.getCurrentUser().userId).toBe(owner);
    expect(vault.getCommittedSavePayload(result)).toBeNull();
    const current = await vault.savePatient(payload(133), { patientId: result.patientId, dedup: false });
    expect(vault.getCommittedSavePayload(current).user.height).toBe(133);
    await vault.createUser(PASSWORD + 'B', { label: 'Fictional second owner', iterations: 10000 });
    expect(vault.getCurrentUser().userId).not.toBe(owner);
    expect(vault.getCommittedSavePayload(current)).toBeNull();
  });

  it('rejects receipts after adapter replacement, including replacement before the save callback', async () => {
    const { vault, adapter } = await device();
    const first = await vault.savePatient(payload(), { dedup: false });
    const replacement = vault.createInMemoryAdapter();
    const put = adapter.putPatientForUser.bind(adapter);
    adapter.putPatientForUser = async (...args) => {
      const result = await put(...args);
      vault.setStorageAdapter(replacement);
      return result;
    };
    const second = await vault.savePatient(payload(134), { patientId: first.patientId, dedup: false });
    expect(vault.isUnlocked()).toBe(true);
    expect(vault.getCommittedSavePayload(first)).toBeNull();
    expect(vault.getCommittedSavePayload(second)).toBeNull();
  });

  it.each(['storage-failure', 'session-change'])('does not publish a committed witness after %s', async kind => {
    const { vault, adapter } = await device();
    const put = adapter.putPatientForUser.bind(adapter);
    adapter.putPatientForUser = async (...args) => {
      if (kind === 'storage-failure') throw Error('Fictional rejected patient header write');
      const result = await put(...args);
      vault.lock('fictional-save-session-change');
      return result;
    };
    const callbacks = [];
    vault.onPatientSaved(result => callbacks.push(result));
    await expect(vault.savePatient(payload(), { dedup: false })).rejects.toThrow(
      kind === 'storage-failure' ? 'Fictional rejected patient header write' : 'Zapis przerwany');
    expect(callbacks).toEqual([]);
    expect(vault.getCommittedSavePayload({ patientId: 'fictional', snapshotId: 'fictional' })).toBeNull();
  });
});
