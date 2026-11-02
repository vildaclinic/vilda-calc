import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const PING = 'vilda-note-changed-ping-v1';
const PAYLOAD = { name: 'Fikcyjny Pacjent Sygnału', user: { age: 9, sex: 'M', height: 130, weight: 30 } };
function storage(onWrite = () => {}) {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null,
    setItem(key, value) { onWrite(key, value); data.set(key, String(value)); },
    removeItem: key => data.delete(key), key: index => [...data.keys()][index] ?? null,
    get length() { return data.size; } };
}
async function device({ failedChannel = false, failedPing = false } = {}) {
  const broadcasts = [], pings = [], order = [];
  const win = { crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: storage((key, value) => {
      if (key !== PING) return;
      if (failedPing) throw Error('Fictional blocked ping');
      pings.push(JSON.parse(value)); order.push('storage');
    }), sessionStorage: storage(), setTimeout, clearTimeout,
    addEventListener() {}, removeEventListener() {}, document: { addEventListener() {}, removeEventListener() {}, hidden: false },
    BroadcastChannel: class {
      constructor(name) { this.name = name; }
      postMessage(message) {
        if (failedChannel) throw Error('Fictional blocked channel');
        broadcasts.push({ channel: this.name, message }); order.push('broadcast');
      }
      close() {}
    },
  };
  win.window = win; win.self = win; win.top = win;
  for (const file of ['vilda_crypto.js', 'vilda_vault.js']) loadBrowserScript(file, win);
  const vault = win.VildaVault, adapter = vault.createInMemoryAdapter();
  vault.setStorageAdapter(adapter);
  await vault.createUser('Fikcyjny#Sygnał!2026', { label: 'Fikcyjny sejf sygnału', iterations: 10000 });
  return { win, vault, adapter, broadcasts, pings, order,
    reset() { broadcasts.length = 0; pings.length = 0; order.length = 0; } };
}
function expectEnvelope(dev, signal, action, forbidden = []) {
  expect(Object.keys(signal).sort()).toEqual(['action', 'changeId', 'sender', 'ts', 'type']);
  expect(signal).toMatchObject({ type: 'note-changed', action });
  expect(typeof signal.ts).toBe('number');
  expect(typeof signal.sender).toBe('string'); expect(signal.sender.length).toBeGreaterThan(0);
  expect(typeof signal.changeId).toBe('string'); expect(signal.changeId.length).toBeGreaterThan(0);
  expect(Object.isFrozen(signal)).toBe(true);
  expect(dev.broadcasts).toHaveLength(1); expect(dev.pings).toHaveLength(1);
  expect(dev.broadcasts[0]).toMatchObject({ channel: 'vilda-notes' });
  expect(dev.broadcasts[0].message).toBe(signal);
  expect(dev.pings[0]).toEqual(signal);
  for (const value of forbidden) expect(JSON.stringify(signal)).not.toContain(value);
  expect(dev.order).toEqual(['local', 'broadcast', 'storage']);
}
afterEach(() => { vi.restoreAllMocks(); });

describe('successful patient changes publish one shared content-free invalidation', () => {
  it.each(['primary', 'external'])('publishes %s create and rename after the real encrypted write, preserving the first callback argument', async kind => {
    const dev = await device(), callbacks = [];
    dev.vault.onPatientSaved((detail, signal) => { callbacks.push({ detail, signal }); dev.order.push('local'); });
    const created = kind === 'primary' ? await dev.vault.savePatient(structuredClone(PAYLOAD))
      : await dev.vault.saveExternalPatient({ firstName: 'Fikcyjny', lastName: 'Zewnętrzny' });
    expect(callbacks).toHaveLength(1); expect(callbacks[0].detail).toBe(created);
    expectEnvelope(dev, callbacks[0].signal, 'patient-saved', [created.patientId, created.header.name]);
    dev.reset();
    const renamed = kind === 'primary'
      ? await dev.vault.savePatient({ ...structuredClone(PAYLOAD), name: 'Fikcyjna Nowa Nazwa' }, { patientId: created.patientId })
      : await dev.vault.saveExternalPatient({ patientId: created.patientId, firstName: 'Fikcyjny', lastName: 'Zmieniony' });
    expect(callbacks).toHaveLength(2); expect(callbacks[1].detail).toBe(renamed);
    const rows = kind === 'primary' ? await dev.vault.listPatients({ strict: true }) : await dev.vault.listExternalPatients({ strict: true });
    expect(rows.find(row => row.patientId === created.patientId).header.name).toBe(renamed.header.name);
    expectEnvelope(dev, callbacks[1].signal, 'patient-saved', [created.patientId, renamed.header.name]);
    expect(callbacks[1].signal.changeId).not.toBe(callbacks[0].signal.changeId);
  });

  it.each(['primary', 'external'])('publishes %s deletion after removal and preserves the local callback payload', async kind => {
    const dev = await device();
    const created = kind === 'primary' ? await dev.vault.savePatient(structuredClone(PAYLOAD))
      : await dev.vault.saveExternalPatient({ firstName: 'Fikcyjny', lastName: 'Zewnętrzny' });
    dev.reset();
    const callbacks = [], afterCallback = [];
    dev.vault.onPatientDeleted((detail, signal) => {
      callbacks.push({ detail, signal }); dev.order.push('local');
      afterCallback.push(dev.adapter.getPatientForUser(dev.vault.getCurrentUser().userId, detail.patientId));
    });
    expect(await dev.vault.removePatient(created.patientId)).toBe(true);
    expect(callbacks).toHaveLength(1);
    expect(callbacks[0].detail).toMatchObject({ patientId: created.patientId });
    expect(await Promise.all(afterCallback)).toEqual([undefined]);
    expectEnvelope(dev, callbacks[0].signal, 'patient-deleted', [created.patientId, created.header.name]);
  });

  it('uses the same signal for a real note callback and both transports without adding note content', async () => {
    const dev = await device(), patient = await dev.vault.savePatient(structuredClone(PAYLOAD));
    dev.reset();
    const callbacks = [];
    dev.vault.onPatientNoteChanged((detail, signal) => { callbacks.push({ detail, signal }); dev.order.push('local'); });
    const note = await dev.vault.savePatientNote({ patientId: patient.patientId, title: 'Fikcyjny tytuł sygnału', body: 'Fikcyjny komentarz lekarza.', category: 'observation' });
    expect(callbacks).toHaveLength(1); expect(callbacks[0].detail).toMatchObject({ id: note.id, patientId: patient.patientId });
    expectEnvelope(dev, callbacks[0].signal, callbacks[0].detail.action, [note.id, patient.patientId, 'Fikcyjny tytuł sygnału', 'Fikcyjny komentarz lekarza.']);
  });

  it('does not collapse two real writes made in the same millisecond into one changeId', async () => {
    const dev = await device();
    vi.spyOn(Date, 'now').mockReturnValue(1793577600000);
    const signals = [];
    dev.vault.onPatientSaved((_, signal) => { signals.push(signal); });
    const patient = await dev.vault.savePatient(structuredClone(PAYLOAD));
    await dev.vault.savePatient({ ...structuredClone(PAYLOAD), name: 'Fikcyjna Druga Nazwa' }, { patientId: patient.patientId });
    expect(signals).toHaveLength(2);
    expect(signals[0].ts).toBe(signals[1].ts);
    expect(signals[0].changeId).not.toBe(signals[1].changeId);
    expect(dev.broadcasts.map(item => item.message.changeId)).toEqual(signals.map(signal => signal.changeId));
    expect(dev.pings.map(item => item.changeId)).toEqual(signals.map(signal => signal.changeId));
  });

  it('isolates throwing callbacks and keeps the immutable transport envelope free of injected patient fields', async () => {
    const dev = await device(), received = [];
    dev.vault.onPatientSaved((_, signal) => { signal.patientName = 'Fikcyjna próba zmiany koperty'; });
    dev.vault.onPatientSaved((detail, signal) => { received.push({ detail, signal }); dev.order.push('local'); });
    const patient = await dev.vault.savePatient(structuredClone(PAYLOAD));
    expect(received).toHaveLength(1);
    expectEnvelope(dev, received[0].signal, 'patient-saved', [patient.patientId, PAYLOAD.name, 'Fikcyjna próba zmiany koperty']);
  });

  it.each([{ failedChannel: true }, { failedPing: true }, { failedChannel: true, failedPing: true }])('does not turn an unavailable invalidation transport into a failed patient write: %j', async failure => {
    const dev = await device(failure), callbacks = [];
    dev.vault.onPatientSaved((detail, signal) => callbacks.push({ detail, signal }));
    const patient = await dev.vault.savePatient(structuredClone(PAYLOAD));
    expect(callbacks).toHaveLength(1);
    expect((await dev.vault.listPatients({ strict: true }))[0].patientId).toBe(patient.patientId);
  });
});

describe('failed or superseded mutations never announce a successful patient change', () => {
  it.each(['primary', 'external'])('does not publish after a rejected %s header write', async kind => {
    const dev = await device(), callbacks = [];
    dev.vault.onPatientSaved((...args) => callbacks.push(args));
    dev.adapter.putPatientForUser = async () => { throw Error('Fictional rejected patient write'); };
    const write = kind === 'primary' ? dev.vault.savePatient(structuredClone(PAYLOAD))
      : dev.vault.saveExternalPatient({ firstName: 'Fikcyjny', lastName: 'Zewnętrzny' });
    await expect(write).rejects.toThrow('Fictional rejected patient write');
    expect(callbacks).toEqual([]); expect(dev.broadcasts).toEqual([]); expect(dev.pings).toEqual([]);
  });

  it('does not publish after a rejected patient deletion', async () => {
    const dev = await device(), created = await dev.vault.savePatient(structuredClone(PAYLOAD)), callbacks = [];
    dev.reset(); dev.vault.onPatientDeleted((...args) => callbacks.push(args));
    dev.adapter.removePatientForUser = async () => { throw Error('Fictional rejected patient deletion'); };
    await expect(dev.vault.removePatient(created.patientId)).rejects.toThrow('Fictional rejected patient deletion');
    expect(callbacks).toEqual([]); expect(dev.broadcasts).toEqual([]); expect(dev.pings).toEqual([]);
  });

  it('does not publish a late success after the actual write changes its owning session', async () => {
    const dev = await device(), callbacks = [];
    const native = dev.adapter.putPatientForUser;
    dev.adapter.putPatientForUser = async (...args) => { const result = await native(...args); dev.vault.lock('fictional-session-change'); return result; };
    dev.vault.onPatientSaved((...args) => callbacks.push(args));
    await expect(dev.vault.savePatient(structuredClone(PAYLOAD))).rejects.toThrow();
    expect(callbacks).toEqual([]); expect(dev.broadcasts).toEqual([]); expect(dev.pings).toEqual([]);
  });
});
