import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Real encrypted care-plan records and the production integration listener.
// HTTP is replaced only at the browser boundary; no production sync service is used.
const storage = () => {
  const items = new Map();
  return { getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, String(value)),
    removeItem: key => items.delete(key), key: index => [...items.keys()][index] ?? null,
    get length() { return items.size; } };
};

async function device({ enabled = true, beacon = () => true } = {}) {
  const callbacks = [], win = { crypto: globalThis.crypto, TextEncoder, TextDecoder, Blob,
    btoa: globalThis.btoa, atob: globalThis.atob, localStorage: storage(), sessionStorage: storage(),
    setTimeout, clearTimeout, setInterval, clearInterval, addEventListener() {}, removeEventListener() {},
    navigator: { sendBeacon: vi.fn(beacon) }, fetch: vi.fn(async () => ({ ok: true })),
    document: { readyState: 'complete', hidden: false, addEventListener() {}, removeEventListener() {} } };
  win.window = win; win.self = win; win.top = win;
  for (const file of ['vilda_crypto.js', 'vilda_vault.js']) loadBrowserScript(file, win);
  const vault = win.VildaVault;
  vault.setStorageAdapter(vault.createInMemoryAdapter());
  await vault.createUser('Fikcyjny#CareTransport!26', { iterations: 10000, label: 'Fikcyjne urządzenie planów' });
  const patient = await vault.savePatient({ name: 'Fikcyjny Jan Transport', user: { sex: 'M', age: 12, height: 150, weight: 40 } });
  win.localStorage.setItem('vilda-sync-enabled-v1', String(enabled));
  win.VildaSync = { syncPush: vi.fn(async () => ({})), onSyncStart() {}, onSyncComplete() {}, onSyncError() {} };
  const onChange = vault.onPatientNoteChanged;
  vi.spyOn(vault, 'onPatientNoteChanged').mockImplementation(callback => { callbacks.push(callback); onChange(callback); });
  // Bind the real listeners without starting a separate initial full sync.
  const unlocked = vi.spyOn(vault, 'isUnlocked').mockReturnValue(false);
  loadBrowserScript('vilda_sync_integration.js', win);
  unlocked.mockRestore();
  return { win, vault, callbacks, patientId: patient.patientId };
}

async function createPlan(d, goal = 'Fikcyjny cel planu.') {
  const result = await d.vault.mutateCarePlan({ patientId: d.patientId, operationId: 'fictional-transport-create',
    action: 'create', title: 'Fikcyjny plan synchronizacji', goal });
  expect(result.saved).toBe(true);
  return result.planId;
}

async function sentNotes(d) {
  return Promise.all(d.win.navigator.sendBeacon.mock.calls.map(async ([url, body]) => {
    const envelope = JSON.parse(await body.text());
    const payload = await d.vault.decryptPayloadForCurrentUser(envelope.payload.iv, envelope.payload.data);
    return { url, body, envelope, note: payload.patientNotes[0] };
  }));
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('care-plan live note transport', () => {
  it('falls back for a real large encrypted parent while small component notes use their beacons', async () => {
    const d = await device({ beacon: (_url, body) => body.size <= 65536 });
    const planId = await createPlan(d, 'Ż'.repeat(20000));
    await vi.waitFor(() => expect(d.win.navigator.sendBeacon).toHaveBeenCalledTimes(2));
    const sent = await sentNotes(d), parent = sent.find(item => item.note.id === planId);
    expect(parent.body.size).toBeGreaterThan(65536);
    expect(parent.note.careContext).toMatchObject({ role: 'plan', goal: 'Ż'.repeat(20000) });
    expect(sent.find(item => item.note.id !== planId).body.size).toBeLessThan(65536);
    expect(d.win.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = d.win.fetch.mock.calls[0];
    expect(url).toBe(parent.url);
    expect(options).toEqual({ method: 'POST', body: parent.body, mode: 'no-cors', credentials: 'omit' });
    expect(options.body).toBe(parent.body);
    expect(options).not.toHaveProperty('keepalive');
    expect(parent.envelope.token).toBeTruthy();
    expect(url).toMatch(/\/v1\/slots\/[^/]+\/delta$/);
  });

  it('does not duplicate a successfully queued parent or component delta', async () => {
    const d = await device(); const planId = await createPlan(d);
    await vi.waitFor(() => expect(d.win.navigator.sendBeacon).toHaveBeenCalledTimes(2));
    expect((await sentNotes(d)).find(item => item.note.id === planId).note.careContext.role).toBe('plan');
    expect(d.win.fetch).not.toHaveBeenCalled();
  });

  it('uses the same encrypted body when sendBeacon throws instead of returning false', async () => {
    const d = await device({ beacon: () => { throw new Error('Fictional browser beacon rejection'); } });
    await createPlan(d);
    await vi.waitFor(() => expect(d.win.navigator.sendBeacon).toHaveBeenCalledTimes(2));
    expect(d.win.fetch).toHaveBeenCalledTimes(2);
    d.win.navigator.sendBeacon.mock.calls.forEach(([url, body], index) => {
      expect(d.win.fetch.mock.calls[index]).toEqual([url, { method: 'POST', body, mode: 'no-cors', credentials: 'omit' }]);
      expect(d.win.fetch.mock.calls[index][1].body).toBe(body);
    });
  });

  it('does not construct or send deltas when synchronization is disabled', async () => {
    const d = await device({ enabled: false });
    const material = vi.spyOn(d.vault, 'getSyncMaterial'), delta = vi.spyOn(d.vault, 'buildNoteDelta');
    await createPlan(d);
    expect(material).not.toHaveBeenCalled(); expect(delta).not.toHaveBeenCalled();
    expect(d.win.navigator.sendBeacon).not.toHaveBeenCalled(); expect(d.win.fetch).not.toHaveBeenCalled();
  });

  it('does not transmit a delayed note notification after the vault has locked', async () => {
    const d = await device(); const planId = await createPlan(d);
    await vi.waitFor(() => expect(d.win.navigator.sendBeacon).toHaveBeenCalledTimes(2));
    d.win.navigator.sendBeacon.mockClear(); d.win.fetch.mockClear();
    const delta = vi.spyOn(d.vault, 'buildNoteDelta');
    d.vault.lock('fictional-test');
    d.callbacks.forEach(callback => callback({ action: 'save', id: planId, patientId: d.patientId }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(delta).not.toHaveBeenCalled();
    expect(d.win.navigator.sendBeacon).not.toHaveBeenCalled(); expect(d.win.fetch).not.toHaveBeenCalled();
  });
});
