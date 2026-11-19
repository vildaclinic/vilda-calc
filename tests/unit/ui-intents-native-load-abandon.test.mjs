import fs from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const helperSource = fs.readFileSync(new URL('../../vilda_ui_intents.js', import.meta.url), 'utf8');
const chromeSource = fs.readFileSync(new URL('../../vilda_chrome.js', import.meta.url), 'utf8');
const start = chromeSource.indexOf('var re=!1,Gv_initialWait='), end = chromeSource.indexOf('function Tt(){', start);
if (start < 0 || end < start) throw new Error('Native pending-patient consumer source missing');
const nativeConsumer = chromeSource.slice(start, end);
const KIND = 'pending-patient-load', KEY = 'vilda:pendingPatientLoad', PASSWORD = 'Fictional#NativeAbandon!2026';
const fixtures = [];
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
async function flush() { for (let index = 0; index < 40; index++) await Promise.resolve(); }
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key), key: index => [...values.keys()][index] ?? null, get length() { return values.size; } };
}
const payload = letter => ({ version: 1, name: 'Fikcyjny transport ' + letter,
  user: { age: 10, ageMonths: 0, sex: 'M', height: 140, weight: 32 } });
async function fixture() {
  const windowEvents = new EventTarget(), documentEvents = new EventTarget(), timers = [];
  const session = storage(), name = { value: payload('A').name, style: {}, dataset: {}, dispatchEvent() {}, addEventListener() {}, removeEventListener() {} };
  const document = { hidden: false, readyState: 'complete', body: {},
    documentElement: { classList: { contains: () => false, add() {}, remove() {} } },
    getElementById: id => id === 'name' ? name : null, querySelector: () => null, querySelectorAll: () => [],
    addEventListener: documentEvents.addEventListener.bind(documentEvents), removeEventListener: documentEvents.removeEventListener.bind(documentEvents),
    dispatchEvent: documentEvents.dispatchEvent.bind(documentEvents) };
  const win = { crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa, atob, URL, Event, CustomEvent,
    document, sessionStorage: session, localStorage: storage(), location: new URL('https://fictional.invalid/index.html'),
    setTimeout(callback, delay) { const handle = setTimeout(callback, delay); timers.push(handle); return handle; }, clearTimeout,
    setInterval, clearInterval, addEventListener: windowEvents.addEventListener.bind(windowEvents),
    removeEventListener: windowEvents.removeEventListener.bind(windowEvents), dispatchEvent: windowEvents.dispatchEvent.bind(windowEvents) };
  win.window = win; win.self = win; win.parent = win; win.top = win;
  for (const file of ['vilda_persistence_adapter.js', 'vilda_crypto.js', 'vilda_vault.js']) loadBrowserScript(file, win);
  new Function('window', 'globalThis', helperSource)(win, win);
  const vault = win.VildaVault, intents = win.VildaUiIntents;
  fixtures.push({ vault, timers });
  vault.setStorageAdapter(vault.createInMemoryAdapter());
  await vault.createUser(PASSWORD, { iterations: 1000, label: 'Fikcyjny sejf granicy odszyfrowania', deferServerContact: true });
  const records = {};
  for (const letter of ['A', 'B', 'C']) records[letter] = await vault.savePatient(payload(letter), { forceNew: true, dedup: false });
  let main = payload('A');
  session.setItem('vildaCurrentPatientId', records.A.patientId); win._vildaCurrentPatientId = records.A.patientId;
  win.VildaPersistence = { ...win.VildaPersistence, readMainSession: () => structuredClone(main),
    writeMainSession: value => { main = structuredClone(value); return true; }, clearMainSession: () => { main = null; return true; }, readClcrSession: () => null };
  win.VildaAuthUI = { isBootReady: () => true, isGuestMode: () => false };
  for (const file of ['vilda_panel_pacjent.js', 'vilda_data_import_export.js']) loadBrowserScript(file, win);
  const nativeImporter = win.VildaDataImportExport;
  // The actual original startup has settled before these controlled races.
  // All accepted-load methods remain the production implementations.
  win.VildaDataImportExport = { ...nativeImporter, whenInitialMainSessionRestoreSettled: async () => ({ ready: true, reason: 'restored', waited: false }) };
  const applied = [], published = [], fetched = [], nativeGet = vault.getPatient;
  win.applyLoadedData = value => { applied.push(value.name); return nativeImporter.applyLoadedData(value); };
  vault.getPatient = async function (id) { fetched.push(id); return nativeGet.call(this, id); };
  document.addEventListener('vilda:patient-loaded', event => {
    published.push(event.detail.patientId); win._vildaCurrentPatientId = event.detail.patientId;
    session.setItem('vildaCurrentPatientId', event.detail.patientId);
  });
  function consumer() {
    const previousTimers = timers.length;
    const run = new Function('r', 'o', 'Gv_dclDone', 'setTimeout', nativeConsumer + ';return Ot;')(win, document, () => true, win.setTimeout);
    // This fixture invokes the genuine entry directly. Keep its automatic
    // DOM-ready timer controlled so a simulated dead document cannot poll.
    timers.splice(previousTimers).forEach(clearTimeout);
    return run;
  }
  async function applyC() {
    const api = win.VildaDataImportExport, load = api.captureAcceptedPatientLoad({ patientId: records.C.patientId });
    const record = await nativeGet.call(vault, records.C.patientId);
    expect(api.runAcceptedPatientLoad(load, record.snapshots[0].payload, {
      apply: value => win.applyLoadedData(value),
      publish: detail => document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: records.C.patientId, source: 'pick', ...detail } })),
    })).toBe(true);
  }
  function hold(phase) {
    const entered = deferred(), release = deferred(); let first = true;
    if (phase === 'decrypt') {
      const original = vault.decryptPayloadForCurrentUser;
      vault.decryptPayloadForCurrentUser = async function (...args) {
        const value = await original.apply(this, args);
        if (first) { first = false; entered.resolve(); await release.promise; }
        return value;
      };
      return { entered: entered.promise, release: release.resolve, restore() { vault.decryptPayloadForCurrentUser = original; } };
    }
    win.VildaUiIntents = Object.freeze({ ...intents, async open(...args) {
      const lease = await intents.open(...args);
      if (first) { first = false; entered.resolve(lease); await release.promise; }
      return lease;
    } });
    return { entered: entered.promise, release: release.resolve, restore() { win.VildaUiIntents = intents; } };
  }
  return { win, document, vault, intents, session, records, applied, published, fetched, consumer, hold, applyC };
}
afterEach(() => {
  for (const { vault, timers } of fixtures.splice(0)) { vault.lock('fictional-abandon-regression-finished'); timers.forEach(clearTimeout); }
});

describe('native encrypted pending-load abandonment', () => {
  it.each(['decrypt', 'open'])('a native C load during %s cannot leave B available to a fresh actual consumer', async phase => {
    const h = await fixture(), receipt = await h.intents.prepare(KIND, { patientId: h.records.B.patientId }), held = h.hold(phase);
    h.consumer()();
    const lease = await held.entered;
    if (phase === 'open') { expect(lease.value.patientId).toBe(h.records.B.patientId); expect(lease.current()).toBe(true); }
    await h.applyC();
    held.release(); await flush(); held.restore();
    expect(h.intents.peek(KIND)).toBeNull();
    expect(h.session.getItem(h.intents.reservationKey(KIND))).toBeNull();
    expect(await h.intents.open(KIND, receipt.raw)).toBeNull();
    expect(h.consumer()()).toBe(true); await flush();
    expect(h.fetched).not.toContain(h.records.B.patientId);
    expect(h.applied).toEqual([payload('C').name]); expect(h.published).toEqual([h.records.C.patientId]);
    expect(h.session.getItem('vildaCurrentPatientId')).toBe(h.records.C.patientId);
  });

  it.each(['decrypt', 'open'].flatMap(phase => ['pagehide', 'replacement'].map(boundary => [phase, boundary])))(
    '%s cleanup preserves a %s handoff', async (phase, boundary) => {
      const h = await fixture(), receipt = await h.intents.prepare(KIND, { patientId: h.records.B.patientId }), held = h.hold(phase);
      h.consumer()(); await held.entered;
      let expected = receipt;
      if (boundary === 'pagehide') h.win.dispatchEvent(new Event('pagehide'));
      else expected = await h.intents.prepare(KIND, { patientId: h.records.C.patientId });
      const nonce = h.session.getItem(h.intents.reservationKey(KIND));
      held.release(); await flush(); held.restore();
      expect(h.session.getItem(KEY)).toBe(expected.raw);
      expect(h.session.getItem(h.intents.reservationKey(KIND))).toBe(nonce);
      expect(h.fetched).not.toContain(h.records.B.patientId); expect(h.applied).toEqual([]); expect(h.published).toEqual([]);
      expect(h.session.getItem('vildaCurrentPatientId')).toBe(h.records.A.patientId);
    },
  );
});
