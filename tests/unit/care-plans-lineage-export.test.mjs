import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

let serial = 0;
const op = () => 'fictional-lineage-' + ++serial;
const storage = () => {
  const map = new Map();
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key), key: index => [...map.keys()][index] ?? null,
    get length() { return map.size; } };
};
async function device() {
  const win = { crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: storage(), sessionStorage: storage(), setTimeout, clearTimeout,
    addEventListener() {}, removeEventListener() {}, document: { addEventListener() {}, removeEventListener() {}, hidden: false } };
  win.window = win; win.self = win; win.top = win;
  for (const file of ['vilda_crypto.js', 'vilda_vault.js']) loadBrowserScript(file, win);
  const vault = win.VildaVault, adapter = vault.createInMemoryAdapter(); vault.setStorageAdapter(adapter);
  const password = 'Fikcyjny#Lineage!' + ++serial;
  await vault.createUser(password, { iterations: 10000, label: 'Fikcyjny sejf historii planu', deferServerContact: true });
  const patientId = (await vault.savePatient({ name: 'Fikcyjna Alicja Historia', user: { sex: 'F', age: 12, height: 150, weight: 40 } })).patientId;
  return { win, vault, adapter, password, patientId, userId: vault.getCurrentUser().userId };
}
async function create(d) {
  const result = await d.vault.mutateCarePlan({ patientId: d.patientId, operationId: op(), action: 'create', title: 'Fikcyjny plan historii' });
  expect(result.saved).toBe(true); return result.plan;
}
async function editRawContext(d, id, change) {
  const raw = await d.adapter.getPatientNoteForUser(d.userId, id);
  const plain = await d.vault.decryptPayloadForCurrentUser(raw.bodyCipher.iv, raw.bodyCipher.data);
  await change(plain.careContext);
  const bodyCipher = await d.vault.encryptPayloadForCurrentUser(plain);
  await d.adapter.putPatientNoteForUser(d.userId, { ...raw, bodyCipher });
}
const record = (d, id) => d.vault.getPatientNote(id);
const raw = (d, id) => d.adapter.getPatientNoteForUser(d.userId, id);
describe('Care plan export refuses an incomplete malformed account', () => {
  it('propagates lineage errors from exports and import merges while retaining readable notes', async () => {
    const d = await device(), plan = await create(d);
    const ordinary = await d.vault.savePatientNote({ patientId: d.patientId, title: 'Fikcyjna zwykła notatka', body: 'Fikcyjna pełna czytelna treść.', category: 'observation' });
    const sync = await d.vault.exportSyncPayload(), patient = await d.vault.exportPatientEnvelope(d.patientId), backup = await d.vault.exportVaultBackup();
    expect(sync.patientNotes.length).toBeGreaterThanOrEqual(3);
    await editRawContext(d, plan.id, context => {
      const binding = context.causality.commitments.find(item => item.key !== 'log');
      context.causality.commitments.push({ ...binding, digest: binding.digest === 'a'.repeat(64) ? 'b'.repeat(64) : 'a'.repeat(64) });
    });
    const before = await raw(d, plan.id), readable = await record(d, ordinary.id);
    for (const action of [
      () => d.vault.exportSyncPayload(), () => d.vault.exportPatientEnvelope(d.patientId),
      () => d.vault.exportVaultBackup(), () => d.vault.buildNoteDelta(plan.id),
      () => d.vault.mergeSyncPayload(sync), () => d.vault.mergeVaultBackup(backup, d.password),
      () => d.vault.importPatientFromEnvelope(patient, d.password),
    ]) {
      await expect(action()).rejects.toMatchObject({ code: 'CARE_LINEAGE_INVALID', vildaMergeBusy: true });
      expect(await raw(d, plan.id)).toEqual(before);
      expect(await record(d, ordinary.id)).toEqual(readable);
    }
    const restore = await device();
    const parsed = d.win.VildaCrypto.parseEnvelope(backup);
    const key = await d.win.VildaCrypto.unwrapMasterFromEnvelope(parsed, d.password);
    const payload = await d.win.VildaCrypto.decryptJson(key, parsed.payload.iv, parsed.payload.data);
    const malformed = sync.patientNotes.find(note => note.id === plan.id);
    malformed.careContext.causality.commitments.push({ ...malformed.careContext.causality.commitments.find(item => item.key !== 'log'), digest: 'f'.repeat(64) });
    payload.patientNotes = sync.patientNotes;
    const encrypted = await d.win.VildaCrypto.encryptJson(key, payload);
    const envelope = d.win.VildaCrypto.buildEnvelope({ ...parsed, salt: parsed.kdf.salt, iterations: parsed.kdf.iterations, payload: encrypted });
    await expect(restore.vault.restoreVaultBackup(envelope, d.password, { label: 'Fikcyjna błędna kopia' })).rejects.toMatchObject({ code: 'CARE_LINEAGE_INVALID', vildaMergeBusy: true });
  });
});
