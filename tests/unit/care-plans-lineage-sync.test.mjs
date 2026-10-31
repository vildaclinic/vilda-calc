import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// The real encrypted vault and the real /changes drain run together. Only HTTP
// is replaced; no account, patient or sync service outside this test is used.
const SLOT = 'e'.repeat(64);
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

async function fixture(failure) {
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
  await vault.createUser('Fikcyjny#LineageTransport!26', { label: 'Fikcyjna lekarka transportu', iterations: 1000 });
  devices.push(vault);
  const userId = vault.getCurrentUser().userId;
  const patientId = (await vault.savePatient({ name: 'Fikcyjny Jan Kursor', user: { sex: 'M', age: 12, height: 150, weight: 40 } })).patientId;
  const created = await vault.mutateCarePlan({ patientId, operationId: 'fictional-cursor-create', action: 'create', title: 'Fikcyjny plan kursora', goal: 'Fikcyjny stan początkowy.' });
  expect(created.saved).toBe(true);
  const planId = created.planId, baseline = await adapter.getPatientNoteForUser(userId, planId);
  const edited = await vault.mutateCarePlan({ patientId, planId, baseRev: created.plan.rev,
    operationId: 'fictional-cursor-edit', action: 'edit', title: 'Fikcyjny plan kursora', goal: 'Fikcyjne ustalenie drugiego urządzenia.' });
  expect(edited.saved).toBe(true);
  const following = await vault.savePatientNote({ patientId, title: 'Fikcyjna kolejna notatka', body: 'Fikcyjna druga delta w tej samej partii.', category: 'inne' });
  const exported = await vault.exportSyncPayload();
  const incoming = exported.patientNotes.find(note => note.id === planId);
  const followingNote = exported.patientNotes.find(note => note.id === following.id);
  expect(followingNote).toBeTruthy();
  await adapter.removePatientNoteForUser(userId, following.id);
  await adapter.putPatientNoteForUser(userId, baseline);

  const localPlain = await vault.decryptPayloadForCurrentUser(baseline.bodyCipher.iv, baseline.bodyCipher.data);
  if (failure === 'limit') {
    for (const [context, side] of [[localPlain.careContext, 'local'], [incoming.careContext, 'incoming']]) {
      const root = context.causality.nodes.find(node => !node.parents.length).id;
      for (let index = 0; index < 8500; index++) context.causality.nodes.push({ id: 'fictional-cursor-' + side + '-' + index, parents: [root] });
    }
  } else {
    // Both snapshots are individually valid, but disagree about the immutable
    // node of the same operation. The source copy remains unchanged for retry.
    localPlain.careContext.causality.nodes.find(node => node.parents.length).openWork = true;
  }
  await adapter.putPatientNoteForUser(userId, { ...baseline,
    bodyCipher: await vault.encryptPayloadForCurrentUser(localPlain) });
  const rejectedParent = await adapter.getPatientNoteForUser(userId, planId);
  const payload = notes => ({ ...exported, patients: [], snapshots: [], patientNotes: notes, credential: undefined, passkeys: undefined });
  const deltas = [{ seq: 1, payload: await vault.encryptPayloadForCurrentUser(payload([incoming])) },
    { seq: 2, payload: await vault.encryptPayloadForCurrentUser(payload([followingNote])) }];
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  vault.getSyncMaterial = async () => ({ slotId: SLOT, authToken: 'FICTIONAL_TOKEN', authTokenHash: 'FICTIONAL_HASH', syncEncKey: key });
  const requests = [], outcomes = [], applyErrors = [];
  let inFlight = 0, beforeReject = null;
  const apply = vault.applyEncryptedDelta;
  vault.applyEncryptedDelta = async encrypted => {
    inFlight++;
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
  const publicErrors = [], completions = [], events = [];
  win.VildaSync.onSyncError(event => { publicErrors.push(event); events.push({ type: 'error', event }); });
  win.VildaSync.onSyncComplete(event => { completions.push(event); events.push({ type: 'complete', event }); });
  // Bind the production subscriber, including its per-account diagnostic,
  // without starting an automatic full sync or a new-device probe.
  const unlocked = vi.spyOn(vault, 'isUnlocked').mockReturnValue(false);
  loadBrowserScript('vilda_sync_integration.js', win);
  unlocked.mockRestore();
  const pull = async expectedOutcomes => {
    expect((await win.VildaSync.syncPull()).action).toBe('up-to-date');
    await vi.waitFor(() => { expect(outcomes).toHaveLength(expectedOutcomes); expect(inFlight).toBe(0); }, { timeout: 5000, interval: 5 });
    // The public pull starts /changes in the background. Let its final
    // microtasks finish before issuing the next public pull.
    await new Promise(resolve => { setTimeout(resolve, 20); });
  };
  return { win, vault, adapter, userId, patientId, planId, following, baseline, rejectedParent,
    requests, outcomes, applyErrors, publicErrors, completions, events, statuses, pull,
    beforeReject: callback => { beforeReject = callback; },
    diagnostic: () => JSON.parse(win.localStorage.getItem('vilda-sync-last-error-v1:' + userId) || 'null'),
    cursor: () => win.localStorage.getItem(CURSOR) };
}

afterEach(() => { devices.splice(0).forEach(vault => vault.lock('fictional-test-finished')); vi.unstubAllGlobals(); });

describe('care-plan lineage failures retain the real /changes cursor for retry', () => {
  for (const failure of ['limit', 'invalid']) it('stops the batch on a lineage ' + failure + ', then retries the same encrypted parent and following note', async () => {
    const d = await fixture(failure), code = failure === 'limit' ? 'CARE_LINEAGE_LIMIT' : 'CARE_LINEAGE_INVALID';
    await d.pull(1);
    expect(d.outcomes).toEqual([{ code, busy: true }]);
    expect(d.publicErrors).toHaveLength(1);
    expect(d.publicErrors[0]).toMatchObject({ operation: 'pull', error: { code, vildaMergeBusy: true } });
    expect(d.publicErrors[0].error).toBe(d.applyErrors[0]);
    expect(d.events.at(-1).type, 'a checked blob cannot hide the later failed delta').toBe('error');
    expect(d.statuses.at(-1)).toMatchObject({ state: 'error', code, message: d.applyErrors[0].message });
    expect(d.diagnostic()).toMatchObject({ operation: 'pull', code, message: d.applyErrors[0].message.slice(0, 300) });
    expect(d.diagnostic().resolvedAt).toBeUndefined();
    expect(d.cursor(), 'the failed parent cannot be acknowledged by advancing beyond its sequence').toBeNull();
    expect(await d.adapter.getPatientNoteForUser(d.userId, d.planId)).toEqual(d.rejectedParent);
    expect(await d.vault.getPatientNote(d.following.id), 'the following delta must not pass a failed parent').toBeNull();

    // Repair only the disposable local copy. The server returns exactly the
    // same encrypted delta; no new seq, replacement delta or fake success.
    await d.adapter.putPatientNoteForUser(d.userId, d.baseline);
    await d.pull(3);
    expect(d.requests).toEqual([0, 0]);
    expect(d.outcomes).toEqual([{ code, busy: true }, { ok: true }, { ok: true }]);
    expect(d.cursor()).toBe('2');
    expect(d.publicErrors).toHaveLength(1);
    expect(d.events.at(-1).type).toBe('complete');
    expect(d.statuses.at(-1).state).toBe('ok');
    // Existing diagnostics preserve the last error after a successful pull;
    // only a successful push marks it resolved. The current UI state is OK.
    expect(d.diagnostic()).toMatchObject({ code, message: d.applyErrors[0].message.slice(0, 300) });
    expect(d.diagnostic().resolvedAt).toBeUndefined();
    expect(await d.vault.getCarePlan(d.planId)).toMatchObject({ goal: 'Fikcyjne ustalenie drugiego urządzenia.', syncNeedsReview: false });
    expect(await d.vault.getPatientNote(d.following.id)).toMatchObject({ title: 'Fikcyjna kolejna notatka' });
    const appliedParent = await d.adapter.getPatientNoteForUser(d.userId, d.planId);
    await d.pull(3);
    expect(d.requests).toEqual([0, 0, 2]);
    expect(await d.adapter.getPatientNoteForUser(d.userId, d.planId)).toEqual(appliedParent);
    expect((await d.vault.listPatientNotesForPatient(d.patientId)).filter(note => note.id === d.following.id)).toHaveLength(1);
  }, 30000);

  for (const change of ['lock', 'account']) it('does not report the old lineage error after a ' + change + ' change while the delta rejects', async () => {
    const d = await fixture('invalid');
    let otherUserId = null;
    d.beforeReject(async () => {
      d.vault.lock('fictional-session-change');
      if (change === 'account') {
        await d.vault.createUser('Fikcyjne#InneKontoTransport!26', {
          label: 'Inne fikcyjne konto transportu', iterations: 1000, deferServerContact: true,
        });
        otherUserId = d.vault.getCurrentUser().userId;
      }
    });
    await d.pull(1);
    expect(d.outcomes).toEqual([{ code: 'CARE_LINEAGE_INVALID', busy: true }]);
    expect(d.cursor()).toBeNull();
    expect(d.publicErrors, 'the old error must not be attributed to the locked or new account').toEqual([]);
    expect(d.diagnostic()).toBeNull();
    if (otherUserId) expect(d.win.localStorage.getItem('vilda-sync-last-error-v1:' + otherUserId)).toBeNull();
    expect(await d.adapter.getPatientNoteForUser(d.userId, d.planId)).toEqual(d.rejectedParent);
    expect(await d.adapter.getPatientNoteForUser(d.userId, d.following.id)).toBeUndefined();
  }, 30000);
});
