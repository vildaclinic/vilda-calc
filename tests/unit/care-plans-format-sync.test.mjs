import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Production encrypted vault, /changes drain and diagnostic subscriber. HTTP
// responses and disposable local storage are the only substituted boundaries.
const SLOT = 'f'.repeat(64);
const CURSOR = 'vilda-sync-cursor-v1:' + SLOT;
const devices = [];
const storage = seed => {
  const values = new Map(Object.entries(seed || {}));
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key), key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; } };
};
const response = (status, value) => ({ status, ok: status >= 200 && status < 300,
  json: async () => value, headers: { get: () => null } });

async function fixture(protectedSide) {
  const statuses = [];
  const win = { crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa, atob, AbortController,
    localStorage: storage({ ['vilda-sync-state-v1:' + SLOT]: JSON.stringify({ registered: true, localEtag: 'E1', lastSyncAt: null }) }),
    sessionStorage: storage({ 'vilda-sync-pulled-v1': '1' }), setTimeout, clearTimeout,
    setInterval: () => 0, clearInterval() {}, addEventListener() {}, removeEventListener() {},
    document: { hidden: false, readyState: 'complete', addEventListener() {}, removeEventListener() {},
      dispatchEvent(event) { if (event.type === 'vilda:sync-status-changed') statuses.push(event.detail); } },
    location: { hostname: 'localhost' } };
  win.window = win; win.self = win; win.top = win;
  for (const file of ['vilda_crypto.js', 'vilda_vault.js']) loadBrowserScript(file, win);
  const vault = win.VildaVault, adapter = vault.createInMemoryAdapter(); vault.setStorageAdapter(adapter);
  await vault.createUser('Fikcyjny#FormatTransport!26', { label: 'Fikcyjna lekarka formatów', iterations: 1000 });
  devices.push(vault);
  const userId = vault.getCurrentUser().userId;
  const patientId = (await vault.savePatient({ name: 'Fikcyjny Jan Format', user: { sex: 'M', age: 12, height: 150, weight: 40 } })).patientId;
  const created = await vault.mutateCarePlan({ patientId, operationId: 'fictional-format-create', action: 'create', title: 'Fikcyjny plan formatu', goal: 'Fikcyjny początek.' });
  expect(created.saved).toBe(true);
  const planId = created.planId, baseline = await adapter.getPatientNoteForUser(userId, planId);
  const edited = await vault.mutateCarePlan({ patientId, planId, baseRev: created.plan.rev,
    operationId: 'fictional-format-edit', action: 'edit', title: 'Fikcyjny plan formatu', goal: 'Fikcyjna poprawna zmiana V1.' });
  expect(edited.saved).toBe(true);
  const following = await vault.savePatientNote({ patientId, title: 'Fikcyjna późniejsza delta', body: 'Fikcyjna druga zmiana tej samej partii.', category: 'inne' });
  const exported = await vault.exportSyncPayload();
  const incoming = exported.patientNotes.find(note => note.id === planId);
  const followingNote = exported.patientNotes.find(note => note.id === following.id);
  expect(followingNote).toBeTruthy();
  await adapter.removePatientNoteForUser(userId, following.id);
  await adapter.putPatientNoteForUser(userId, baseline);

  if (protectedSide === 'incoming') {
    // No format-2 writer is being enabled or simulated. Any protected version
    // on this legacy transport must be rejected before ordinary V1 writes.
    incoming.careContext = { ...incoming.careContext, version: 2 };
  } else {
    const localPlain = await vault.decryptPayloadForCurrentUser(baseline.bodyCipher.iv, baseline.bodyCipher.data);
    localPlain.careContext = { ...localPlain.careContext, version: 2 };
    await adapter.putPatientNoteForUser(userId, { ...baseline,
      bodyCipher: await vault.encryptPayloadForCurrentUser(localPlain) });
  }
  const rejectedParent = await adapter.getPatientNoteForUser(userId, planId);
  const payload = notes => ({ ...exported, patients: [], snapshots: [], patientNotes: notes, credential: undefined, passkeys: undefined });
  const deltas = [{ seq: 1, payload: await vault.encryptPayloadForCurrentUser(payload([incoming])) },
    { seq: 2, payload: await vault.encryptPayloadForCurrentUser(payload([followingNote])) }];
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  vault.getSyncMaterial = async () => ({ slotId: SLOT, authToken: 'FICTIONAL_TOKEN', authTokenHash: 'FICTIONAL_HASH', syncEncKey: key });
  const requests = [], outcomes = [], applyErrors = [], appliedCiphertexts = [];
  let inFlight = 0, beforeReject = null;
  const apply = vault.applyEncryptedDelta;
  vault.applyEncryptedDelta = async encrypted => {
    inFlight++; appliedCiphertexts.push({ ...encrypted });
    try { const result = await apply(encrypted); outcomes.push({ ok: true }); return result; }
    catch (error) {
      applyErrors.push(error); outcomes.push({ code: error.code, busy: error.vildaMergeBusy === true });
      if (beforeReject) await beforeReject(error);
      throw error;
    }
    finally { inFlight--; }
  };
  vi.stubGlobal('fetch', async url => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/status')) return response(200, { etag: 'E1', size: 10 });
    if (parsed.pathname.endsWith('/changes')) {
      const since = Number(parsed.searchParams.get('since')) || 0; requests.push(since);
      return response(200, { deltas: deltas.filter(delta => delta.seq > since), headSeq: 2 });
    }
    if (parsed.pathname.endsWith('/blob')) return response(304, {});
    throw new Error('Unexpected fictional sync request: ' + parsed.pathname);
  });
  loadBrowserScript('vilda_sync.js', win);
  const publicErrors = [], events = [];
  win.VildaSync.onSyncError(event => { publicErrors.push(event); events.push({ type: 'error', event }); });
  win.VildaSync.onSyncComplete(event => { events.push({ type: 'complete', event }); });
  // Bind the real per-account diagnostic subscriber without automatic pull or
  // new-device bootstrap. The manual public syncPull still owns the drain.
  const unlocked = vi.spyOn(vault, 'isUnlocked').mockReturnValue(false);
  loadBrowserScript('vilda_sync_integration.js', win);
  unlocked.mockRestore();
  const pull = async expectedOutcomes => {
    expect((await win.VildaSync.syncPull()).action).toBe('up-to-date');
    await vi.waitFor(() => { expect(outcomes).toHaveLength(expectedOutcomes); expect(inFlight).toBe(0); }, { timeout: 5000, interval: 5 });
    await new Promise(resolve => { setTimeout(resolve, 20); });
  };
  return { win, vault, adapter, userId, patientId, planId, following, baseline, rejectedParent,
    deltas, requests, outcomes, applyErrors, appliedCiphertexts, publicErrors, events, statuses, pull,
    beforeReject: callback => { beforeReject = callback; },
    diagnostic: () => JSON.parse(win.localStorage.getItem('vilda-sync-last-error-v1:' + userId) || 'null'),
    cursor: () => win.localStorage.getItem(CURSOR) };
}

afterEach(() => { devices.splice(0).forEach(vault => vault.lock('fictional-format-test-finished')); vi.unstubAllGlobals(); });

describe('protected care formats stop the real /changes batch without acknowledging it', () => {
  it('keeps rejecting an incoming V2 ciphertext while the legacy writer is disabled', async () => {
    const d = await fixture('incoming');
    await d.pull(1);
    expect(d.outcomes).toEqual([{ code: 'CARE_FORMAT_UNSUPPORTED', busy: true }]);
    expect(d.publicErrors).toHaveLength(1);
    expect(d.publicErrors[0]).toMatchObject({ operation: 'pull', error: { code: 'CARE_FORMAT_UNSUPPORTED', vildaMergeBusy: true } });
    expect(d.publicErrors[0].error).toBe(d.applyErrors[0]);
    expect(d.statuses.at(-1)).toMatchObject({ state: 'error', code: 'CARE_FORMAT_UNSUPPORTED', message: d.applyErrors[0].message });
    expect(d.diagnostic()).toMatchObject({ operation: 'pull', code: 'CARE_FORMAT_UNSUPPORTED' });
    expect(d.events.at(-1).type, 'the earlier blob check cannot hide a later unsupported delta').toBe('error');
    expect(d.cursor()).toBeNull();
    expect(await d.adapter.getPatientNoteForUser(d.userId, d.planId)).toEqual(d.rejectedParent);
    expect(await d.vault.getPatientNote(d.following.id)).toBeNull();

    await d.pull(2);
    expect(d.requests).toEqual([0, 0]);
    expect(d.outcomes).toEqual([{ code: 'CARE_FORMAT_UNSUPPORTED', busy: true }, { code: 'CARE_FORMAT_UNSUPPORTED', busy: true }]);
    expect(d.appliedCiphertexts).toEqual([d.deltas[0].payload, d.deltas[0].payload]);
    expect(d.cursor()).toBeNull();
    expect(await d.adapter.getPatientNoteForUser(d.userId, d.planId)).toEqual(d.rejectedParent);
    expect(await d.vault.getPatientNote(d.following.id)).toBeNull();
  });

  it('retries the identical valid V1 ciphertext after only the disposable current format is restored', async () => {
    const d = await fixture('current');
    await d.pull(1);
    expect(d.outcomes).toEqual([{ code: 'CARE_FORMAT_UNSUPPORTED', busy: true }]);
    expect(d.cursor()).toBeNull();
    expect(d.publicErrors).toHaveLength(1);
    expect(d.statuses.at(-1)).toMatchObject({ state: 'error', code: 'CARE_FORMAT_UNSUPPORTED' });
    expect(await d.adapter.getPatientNoteForUser(d.userId, d.planId)).toEqual(d.rejectedParent);
    expect(await d.adapter.getPatientNoteForUser(d.userId, d.following.id)).toBeUndefined();

    // The remote delta stays byte-for-byte identical and V1. This repairs only
    // test-owned local data; it does not relabel or enable a format-2 writer.
    await d.adapter.putPatientNoteForUser(d.userId, d.baseline);
    await d.pull(3);
    expect(d.requests).toEqual([0, 0]);
    expect(d.appliedCiphertexts).toEqual([d.deltas[0].payload, d.deltas[0].payload, d.deltas[1].payload]);
    expect(d.outcomes).toEqual([{ code: 'CARE_FORMAT_UNSUPPORTED', busy: true }, { ok: true }, { ok: true }]);
    expect(d.cursor()).toBe('2');
    expect(d.publicErrors).toHaveLength(1);
    expect(d.events.at(-1).type).toBe('complete');
    expect(d.statuses.at(-1).state).toBe('ok');
    expect(d.diagnostic()).toMatchObject({ code: 'CARE_FORMAT_UNSUPPORTED' });
    expect(d.diagnostic().resolvedAt).toBeUndefined();
    expect(await d.vault.getCarePlan(d.planId)).toMatchObject({ goal: 'Fikcyjna poprawna zmiana V1.', syncNeedsReview: false });
    expect(await d.vault.getPatientNote(d.following.id)).toMatchObject({ title: 'Fikcyjna późniejsza delta' });
    const appliedParent = await d.adapter.getPatientNoteForUser(d.userId, d.planId);
    await d.pull(3);
    expect(d.requests).toEqual([0, 0, 2]);
    expect(await d.adapter.getPatientNoteForUser(d.userId, d.planId)).toEqual(appliedParent);
  });

  for (const change of ['lock', 'account']) it('does not attribute the old format error after a ' + change + ' change', async () => {
    const d = await fixture('current');
    let otherUserId = null;
    d.beforeReject(async () => {
      d.vault.lock('fictional-format-session-change');
      if (change === 'account') {
        await d.vault.createUser('Fikcyjne#InneKontoFormat!26', {
          label: 'Inne fikcyjne konto formatów', iterations: 1000, deferServerContact: true,
        });
        otherUserId = d.vault.getCurrentUser().userId;
      }
    });
    await d.pull(1);
    expect(d.outcomes).toEqual([{ code: 'CARE_FORMAT_UNSUPPORTED', busy: true }]);
    expect(d.cursor()).toBeNull();
    expect(d.publicErrors).toEqual([]);
    expect(d.diagnostic()).toBeNull();
    if (otherUserId) expect(d.win.localStorage.getItem('vilda-sync-last-error-v1:' + otherUserId)).toBeNull();
    expect(await d.adapter.getPatientNoteForUser(d.userId, d.planId)).toEqual(d.rejectedParent);
    expect(await d.adapter.getPatientNoteForUser(d.userId, d.following.id)).toBeUndefined();
  });
});
