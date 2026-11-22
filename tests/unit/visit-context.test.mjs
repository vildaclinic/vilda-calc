import { describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const patientId = 'fictional-visit-patient';
const source = () => ({ version: 1, name: 'Fikcyjny Pacjent Wizyty', user: { age: 12, ageMonths: 0, sex: 'M', height: 145, weight: 35, measuredAtISO: '2026-10-21' } });

function environment({ importer = false, homePreview = false, storage = new Map() } = {}) {
  let account = { userId: 'fictional-owner' }, vaultEpoch = 0;
  const locks = [], attributes = new Set(), listeners = new Map(), fields = new Map(), writes = vi.fn();
  for (const [id, value] of Object.entries({ name: source().name, age: '12', ageMonths: '0', sex: 'M', height: '145', weight: '35' }))
    fields.set(id, { id, value, style: {}, dataset: {}, addEventListener() {}, dispatchEvent() {}, removeAttribute() {}, setAttribute() {}, classList: { add() {}, remove() {}, contains: () => false } });
  const win = {
    __VILDA_HOME_GABINET_PREVIEW__: homePreview,
    crypto: { randomUUID: vi.fn(() => webcrypto.randomUUID()) },
    VildaVault: {
      getCurrentUser: () => account, isUnlocked: () => !!account, onLock: fn => locks.push(fn),
      normalizePatientName: value => String(value || '').trim().toLowerCase(),
      captureSyncOperationSession: () => ({ account, vaultEpoch }),
      assertSyncOperationSession: token => { if (token.account !== account || token.vaultEpoch !== vaultEpoch) throw new Error('Fikcyjna zmiana sesji'); },
    },
    document: { readyState: 'loading', getElementById: id => fields.get(id) || null, querySelector: () => null, querySelectorAll: () => [], dispatchEvent() {},
      addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
      documentElement: { toggleAttribute(name, value) { if (value) attributes.add(name); else attributes.delete(name); }, hasAttribute: name => attributes.has(name) } },
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    VildaPersistence: { updateShared: writes, readClcrSession: () => null },
    setTimeout: () => 0, clearTimeout() {}, addEventListener() {}, dispatchEvent() {}, confirm: () => true,
    Event: class { constructor(type) { this.type = type; } }, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
  };
  loadBrowserScript('vilda_visit_context.js', win);
  if (importer) loadBrowserScript('vilda_data_import_export.js', win);
  return { win, api: win.VildaVisitContext, fields, storage, writes, locks,
    notify(type, detail) { for (const fn of listeners.get(type) || []) fn({ type, detail }); },
    changeOwner(value) { account = value == null ? null : { userId: value }; vaultEpoch++; },
    rotateSession() { vaultEpoch++; } };
}

function importFile(h, data, options = {}) {
  return h.win.VildaDataImportExport.handleFile({ target: { files: [{ name: 'fictional-visit.json', type: 'application/json' }], value: 'fictional-visit.json' } }, {
    readFileAsText: () => JSON.stringify(data), ...options,
  });
}

describe('persistent working encounter context', () => {
  it('allocates once, keeps ID on date correction, and does not alter the separate puberty marker', () => {
    const h = environment(), data = source(); data.user.pubertyAssessmentVisit = { visitId: 'separate-examination-marker' };
    const first = h.api.capture(data, { patientId: null }), original = clone(data);
    expect(h.api.capture(data, { patientId: null })).toEqual(first);
    data.user.measuredAtISO = '2026-10-20';
    const corrected = h.api.capture(data, { patientId: null });
    expect(corrected).toEqual({ ...first, clinicalDateISO: '2026-10-20' });
    expect(data.user.pubertyAssessmentVisit).toEqual(original.user.pubertyAssessmentVisit);
    expect(h.win.crypto.randomUUID).toHaveBeenCalledOnce();
  });

  it('readonly capture allocates nothing, writes nothing, and date projection leaves RAM untouched', () => {
    const h = environment(), data = source();
    expect(h.api.capture(data, { patientId, readOnly: true })).toBeNull();
    expect(h.win.crypto.randomUUID).not.toHaveBeenCalled();
    const first = h.api.beginNew({ patientId, clinicalDateISO: '2026-10-21' });
    data.user.measuredAtISO = '2026-10-22';
    expect(h.api.capture(data, { patientId, readOnly: true }).clinicalDateISO).toBe('2026-10-22');
    expect(h.api.currentFor(patientId)).toEqual(first);
    expect(h.writes).not.toHaveBeenCalled();
  });

  it('explicit New allocates a second visit on the same day, Restore and session reload keep the saved identity', () => {
    const h = environment(), data = source();
    data.visit = h.api.beginNew({ patientId, clinicalDateISO: data.user.measuredAtISO });
    const next = h.api.beginNew({ patientId, clinicalDateISO: data.user.measuredAtISO });
    expect(next.visitId).not.toBe(data.visit.visitId);
    expect(h.api.load(data)).toEqual(data.visit);
    const reloaded = environment(); reloaded.api.load(clone(data));
    expect(reloaded.api.capture(data, { patientId })).toEqual(data.visit);
    expect(reloaded.win.crypto.randomUUID).not.toHaveBeenCalled();
  });

  it('binds only committed patient identity and clears across patient/account/lock boundaries', () => {
    const h = environment(), data = source();
    data.visit = h.api.capture(data, { patientId: null });
    const visitId = data.visit.visitId;
    data.visit.patientId = patientId;
    expect(h.api.commit(data, patientId).visitId).toBe(visitId);
    expect(h.api.currentFor('another-fictional-patient')).toBeNull();
    const another = h.api.capture(source(), { patientId: 'another-fictional-patient' });
    expect(another.visitId).not.toBe(visitId);
    h.changeOwner('another-fictional-owner');
    expect(h.api.currentFor(another.patientId)).toBeNull();
    h.api.beginNew({ patientId }); h.locks.forEach(fn => fn());
    expect(h.api.currentFor(patientId)).toBeNull();
    h.api.beginNew({ patientId }); h.api.clear();
    expect(h.api.capture({ version: 1, user: { sex: 'M', age: null } }, { patientId: null })).toBeNull();
  });

  it('keeps inferred historical identity and unknown dates without inventing a current-day visit', () => {
    const h = environment(), data = source();
    delete data.user.measuredAtISO;
    data.visit = { ...h.api.create({ patientId }), clinicalDateISO: null, origin: 'legacy-inferred', dateSource: 'unknown' };
    h.api.load(data);
    expect(h.api.capture(data, { patientId })).toEqual(data.visit);
    expect(h.api.currentFor(patientId)).toBeNull();
    expect(h.win.crypto.randomUUID).toHaveBeenCalledOnce();
  });

  it('quick measurement retry keeps new ID, edits keep ID, historical growth rows do not create visits', () => {
    const h = environment(), data = source();
    data.visit = h.api.beginNew({ patientId, clinicalDateISO: data.user.measuredAtISO });
    const fresh = h.api.forMeasurement(data, { mode: 'new', patientId });
    expect(fresh.visitId).not.toBe(data.visit.visitId);
    data.user.measuredAtISO = '2026-10-22';
    expect(h.api.forMeasurement(data, { mode: 'new', patientId, pending: fresh })).toEqual({ ...fresh, clinicalDateISO: '2026-10-22' });
    expect(h.api.forMeasurement(data, { mode: 'edit', patientId })).toEqual({ ...data.visit, clinicalDateISO: '2026-10-22' });
    expect(h.api.forMeasurement(data, { mode: 'new', historical: true, patientId })).toEqual(data.visit);
  });

  it('native collector carries the identity, projects it read-only and detaches it when form ownership changes', () => {
    const h = environment({ importer: true }), data = source();
    h.storage.set('vildaCurrentPatientId', patientId); h.win.lastLoadedData = clone(data);
    data.visit = h.api.beginNew({ patientId, clinicalDateISO: data.user.measuredAtISO });
    const collected = h.win.VildaDataImportExport.collectUserData();
    expect(collected.visit).toEqual(data.visit);
    const readOnly = h.win.VildaDataImportExport.captureCurrentUserDataReadOnly({ base: data });
    expect(readOnly.visit).toEqual(data.visit);
    h.fields.get('name').value = 'Inny Fikcyjny Pacjent';
    const changed = h.win.VildaDataImportExport.collectUserData();
    expect(changed.visit.patientId).toBeNull();
    expect(changed.visit.visitId).not.toBe(data.visit.visitId);
  });

  it('native session apply and clear replace metadata as well as clinical fields', () => {
    const h = environment({ importer: true }), data = source();
    h.storage.set('vildaCurrentPatientId', patientId); h.win.lastLoadedData = clone(data);
    data.visit = h.api.create({ patientId, clinicalDateISO: data.user.measuredAtISO });
    expect(h.win.VildaDataImportExport.applyLoadedData(data, { isSessionRestore: true, syncSharedUserDataFromLoadedData() {} })).toBe(true);
    expect(h.win.VildaDataImportExport.collectUserData().visit).toEqual(data.visit);
    h.win.VildaDataImportExport.clearAllData();
    expect(h.api.currentFor(patientId)).toBeNull();
  });

  it('native plain JSON import, Restore and save keep the exported visit when creating a local patient card', async () => {
    const h = environment({ importer: true }), data = source(), native = h.win.VildaDataImportExport;
    data.visit = h.api.create({ patientId: 'fictional-card-on-exporting-device', clinicalDateISO: data.user.measuredAtISO });
    h.api.clear();
    importFile(h, data);
    native.restoreLoadedState();
    const collected = native.collectUserData();
    expect(collected.visit).toEqual({ ...data.visit, patientId: null });
    expect(collected.user).toMatchObject({ age: 12, ageMonths: 0, sex: 'M', height: 145, weight: 35 });
    expect(data.visit.patientId).toBe('fictional-card-on-exporting-device');
    const committed = new WeakMap(), vault = h.win.VildaVault;
    vault.getCommittedSavePayload = result => clone(committed.get(result));
    vault.savePatient = vi.fn(async payload => {
      const result = { patientId, snapshotId: 'fictional-imported-snapshot', snapshotCount: 1, isNew: true };
      committed.set(result, { ...clone(payload), visit: { ...payload.visit, patientId } });
      return result;
    });
    await native.saveUserData({ collectUserData: () => collected });
    expect(vault.savePatient).toHaveBeenCalledOnce();
    expect(collected.visit).toEqual({ ...data.visit, patientId });
    expect(h.win.lastLoadedData.visit).toEqual(collected.visit);
  });

  it('exposes the native restore UI in Gabinet only for an independent JSON file, including after reload', () => {
    const opts = { importer: true, homePreview: true, storage: new Map() };
    const h = environment(opts), fileRestore = env => env.win.document.documentElement.hasAttribute('data-home-file-restore');
    expect(fileRestore(h)).toBe(false);
    importFile(h, source());
    expect(fileRestore(h)).toBe(true);
    const reloaded = environment(opts);
    expect(fileRestore(reloaded)).toBe(true);
    reloaded.notify('vilda:session-changed', { loggedIn: true });
    expect(fileRestore(reloaded)).toBe(true);
    expect(reloaded.win.VildaDataImportExport.applyLoadedData(source(), { isSessionRestore: true })).toBe(true);
    expect(fileRestore(reloaded)).toBe(true);
    expect(reloaded.win.VildaDataImportExport.applyLoadedData(source())).toBe(true);
    expect(fileRestore(reloaded)).toBe(false);
    expect(fileRestore(environment(opts))).toBe(false);
    importFile(reloaded, source());
    reloaded.locks.forEach(notify => notify());
    expect(fileRestore(reloaded)).toBe(false);
    const classic = environment({ importer: true });
    importFile(classic, source());
    expect(fileRestore(classic)).toBe(false);
    expect(classic.storage.has('vildaHomeIndependentFileRestore')).toBe(false);
  });

  it('JSON file rebinding uses only the local pre-apply patient target, never the exported patient ID', () => {
    for (const samePatient of [true, false]) {
      const h = environment({ importer: true }), data = source(), native = h.win.VildaDataImportExport;
      h.storage.set('vildaCurrentPatientId', patientId);
      h.win.lastLoadedData = { ...source(), name: samePatient ? data.name : 'Inny Fikcyjny Pacjent' };
      data.visit = h.api.create({ patientId: 'fictional-external-card', clinicalDateISO: data.user.measuredAtISO });
      importFile(h, data); native.restoreLoadedState();
      const collected = native.collectUserData();
      if (samePatient) expect(collected.visit).toEqual({ ...data.visit, patientId });
      else expect(collected.visit.visitId).not.toBe(data.visit.visitId);
      expect(collected.visit.patientId).not.toBe(data.visit.patientId);
    }
  });

  it.each(['clear', 'patient', 'account', 'session', 'apply'])('delayed JSON file read cannot restore a visit after %s changes', async reason => {
    const h = environment({ importer: true }), data = source(), native = h.win.VildaDataImportExport;
    data.visit = h.api.create({ patientId: 'fictional-external-card', clinicalDateISO: data.user.measuredAtISO });
    let resolve;
    const pending = new Promise(done => { resolve = done; }), onLoaded = vi.fn();
    const reading = importFile(h, data, { readFileAsText: () => pending, onLoaded });
    if (reason === 'clear') native.clearAllData();
    if (reason === 'patient') h.storage.set('vildaCurrentPatientId', 'fictional-another-patient');
    if (reason === 'account') h.changeOwner('fictional-another-owner');
    if (reason === 'session') h.rotateSession();
    if (reason === 'apply') native.applyLoadedData(source(), { isSessionRestore: true });
    const before = h.win.lastLoadedData ? clone(h.win.lastLoadedData) : null;
    resolve(JSON.stringify(data)); await reading;
    expect(onLoaded).not.toHaveBeenCalled();
    expect(h.win.lastLoadedData || null).toEqual(before);
  });

  it('a later JSON file import wins over an earlier pending read', async () => {
    const h = environment({ importer: true }), data = source(), next = source(), native = h.win.VildaDataImportExport;
    data.visit = h.api.create({ patientId: 'fictional-external-card', clinicalDateISO: data.user.measuredAtISO });
    next.visit = h.api.create({ patientId: 'fictional-external-card', clinicalDateISO: next.user.measuredAtISO });
    let resolve;
    const pending = new Promise(done => { resolve = done; });
    const reading = importFile(h, data, { readFileAsText: () => pending });
    importFile(h, next);
    resolve(JSON.stringify(data)); await reading;
    native.restoreLoadedState();
    expect(native.collectUserData().visit).toEqual({ ...next.visit, patientId: null });
  });

  it('unmarked direct apply cannot request the file-only patient rebinding', () => {
    const h = environment({ importer: true }), data = source(), native = h.win.VildaDataImportExport;
    data.visit = h.api.create({ patientId: 'fictional-external-card', clinicalDateISO: data.user.measuredAtISO });
    native.applyLoadedData(data); native.restoreLoadedState();
    expect(native.collectUserData().visit.visitId).not.toBe(data.visit.visitId);
  });

  it.each([{ version: 2 }, { visitId: 'invalid-fictional-id' }])('rejects malformed or future file visit metadata before touching clinical state: %j', override => {
    // Capture timestamps are part of the full payload assertion. Hold only the
    // clock so a millisecond between captures cannot mimic a state mutation.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-21T09:00:00.000Z'));
    try {
      const h = environment({ importer: true }), data = source(), native = h.win.VildaDataImportExport, onError = vi.fn();
      data.visit = { ...h.api.create({ patientId }), ...override };
      const before = native.collectUserData();
      const sequence = native.getApplyLoadedDataSequence();
      importFile(h, data, { onError });
      expect(onError).toHaveBeenCalledOnce();
      expect(onError.mock.calls[0][0].code).toBe('INVALID_VISIT_IDENTITY');
      expect(native.getApplyLoadedDataSequence()).toBe(sequence);
      expect(native.collectUserData()).toEqual(before);
      expect(h.win.lastLoadedData).toBeUndefined();
    } finally { vi.useRealTimers(); }
  });

  it('native blank form with default zero months does not allocate a phantom visit', () => {
    const h = environment({ importer: true });
    for (const field of h.fields.values()) field.value = '';
    h.fields.get('ageMonths').value = '0'; h.fields.get('sex').value = 'M';
    expect(h.win.VildaDataImportExport.collectUserData().visit).toBeUndefined();
    expect(h.win.crypto.randomUUID).not.toHaveBeenCalled();
    h.fields.get('age').value = '0';
    expect(h.win.VildaDataImportExport.collectUserData().visit.visitId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('own save adopts the exact vault-committed visit before publishing its new baseline', async () => {
    const h = environment({ importer: true }), vault = h.win.VildaVault, ticket = {}, committed = new WeakMap();
    vault.captureSyncOperationSession = () => ticket;
    vault.assertSyncOperationSession = value => { if (value !== ticket) throw new Error('Obca sesja testowa'); };
    vault.getCommittedSavePayload = result => clone(committed.get(result));
    vault.savePatient = async data => {
      const result = { patientId, snapshotId: 'fictional-snapshot', snapshotCount: 1, isNew: true };
      committed.set(result, { ...clone(data), visit: { ...data.visit, patientId } });
      return result;
    };
    const intermediate = [];
    h.win.vildaPersistFlushNow = () => {
      expect(h.storage.get('vildaCurrentPatientId')).toBeUndefined();
      intermediate.push(h.win.VildaDataImportExport.collectUserData().visit);
    };
    const submitted = h.win.VildaDataImportExport.collectUserData(), before = clone(submitted.visit);
    await h.win.VildaDataImportExport.saveUserData({ collectUserData: () => submitted });
    expect(submitted.visit).toEqual({ ...before, patientId });
    expect(h.win.lastLoadedData.visit).toEqual(submitted.visit);
    expect(h.api.currentFor(patientId)).toEqual(submitted.visit);
    expect(intermediate).toEqual([submitted.visit]);
    h.storage.set('vildaCurrentPatientId', patientId);
    expect(h.win.VildaDataImportExport.collectUserData().visit).toEqual(submitted.visit);
    h.storage.delete('vildaCurrentPatientId');
    // The temporary handoff must close; a later unknown owner cannot use it.
    expect(h.win.VildaDataImportExport.collectUserData().visit.visitId).not.toBe(submitted.visit.visitId);
  });
});
