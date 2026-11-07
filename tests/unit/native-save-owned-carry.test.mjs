import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { powloka } from '../support/powloka-harness.mjs';

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const PID = 'fictional-native-carry-patient';
const record = () => ({ version: 1, name: 'Fikcyjny Pacjent Zachowania Danych',
  user: { sex: 'M', age: 13, ageMonths: 0, weight: 46, height: 158, dobISO: '2013-06-17' },
  plan: { palFactor: 1.8, palWybrany: true }, intake: { pal: '1.8',
    history: [{ ageMonths: 120, height: 141, weight: 33, annotation: { fictional: 'independent intake' } }], estKcalPerDay: 2160 },
  advanced: { data: { measurements: [{ ageMonths: 144, height: 151, weight: 41 }] } },
  growthBasic: { data: { measurements: [{ ageMonths: 100, height: 130, weight: 29, annotation: { fictional: 'independent basic' } }], customVersion: 7 } },
});

// Actual native collector, accepted load, main-session ownership merge, opaque
// panel authority and explicit Save. Only DOM/storage/Vault I/O are synthetic;
// the durable boundary records precisely the payload supplied to savePatient.
function environment(source = record(), { patientId = PID, panel = true, load = true, shell = false, publishPatientOnSave = true } = {}) {
  let main = null, docproUi = null, owner = 'fictional-native-carry-owner', generation = 1, sequence = 0;
  const committed = new WeakMap(), snapshots = [], fields = new Map(), storage = new Map(), listeners = [];
  if (patientId) storage.set('vildaCurrentPatientId', patientId);
  const field = (id, value = '') => ({ id, value: String(value), dataset: {}, style: {}, disabled: false,
    addEventListener() {}, dispatchEvent() {}, setAttribute() {}, removeAttribute() {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false } });
  for (const id of ['name', 'age', 'ageMonths', 'sex', 'weight', 'height', 'dobInput']) fields.set(id, field(id));
  const document = { readyState: 'loading', getElementById: id => fields.get(id) || null,
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener(type, callback, options) { listeners.push({ type, callback, capture: options === true || !!options?.capture }); },
    dispatchEvent(event) {
      for (const item of listeners.filter(item => item.type === event.type).sort((a, b) => Number(b.capture) - Number(a.capture))) item.callback(event);
      return true;
    },
  };
  const persistence = {
    getStorage: () => ({}), readMainSession: vi.fn(() => clone(main)), readClcrSession: () => null,
    readDocproUi: vi.fn(() => clone(docproUi)), writeDocproUi: vi.fn(value => { docproUi = clone(value); return true; }),
    writeMainSession(value) { main = clone(value); return true; }, clearMainSession() { main = null; },
  };
  const vault = {
    isUnlocked: () => true, getCurrentUser: () => ({ userId: owner }),
    normalizePatientName: name => String(name || '').trim().toLowerCase(),
    captureSyncOperationSession: () => Object.freeze({ owner, generation }),
    assertSyncOperationSession(token) { if (token.owner !== owner || token.generation !== generation) throw new Error('Fictional account change'); return true; },
    getCommittedSavePayload: result => clone(committed.get(result)),
    savePatient: vi.fn(async (payload, options = {}) => {
      const result = { patientId: options.patientId || storage.get('vildaCurrentPatientId') || PID, snapshotId: `fictional-native-snapshot-${++sequence}`, snapshotCount: sequence };
      snapshots.push(clone(payload)); committed.set(result, clone(payload));
      if (publishPatientOnSave) storage.set('vildaCurrentPatientId', result.patientId); return result;
    }),
  };
  const host = shell ? powloka(null, host => { host.sessionStorage = { getItem: key => storage.get(key) ?? null }; }) : null;
  const frame = host?.ramki.get(host.shell.routes.docpro.src.split('?')[0]);
  const win = Object.assign(frame?.contentWindow || {}, { document, VildaPersistence: persistence, VildaVault: vault,
    VildaAuthUI: { isBootReady: () => true },
    VildaDobAge: { restorePending: () => false, readISO: () => fields.get('dobInput')?.value || null },
    confirm: () => true, location: { pathname: '/docpro.html' }, setTimeout: () => 0, clearTimeout() {}, addEventListener() {}, dispatchEvent() {},
    Event: class { constructor(type) { this.type = type; } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
  }); if (!host) win.parent = win;
  if (frame) frame.contentDocument = document;
  document.defaultView = win;
  if (panel) loadBrowserScript('vilda_panel_pacjent.js', win);
  loadBrowserScript('vilda_data_import_export.js', win);
  const api = win.VildaDataImportExport, options = { syncSharedUserDataFromLoadedData() {} };
  api.initMainSessionPersistence(options);
  if (load) {
    api.applyLoadedData(clone(source), options);
    // The native New visit leaves these editable controls blank. Supply the
    // clinician's current measurements without an intervening draft write.
    for (const [id, value] of Object.entries({ age: source.user.age, ageMonths: source.user.ageMonths,
      weight: source.user.weight, height: source.user.height, dobInput: source.user.dobISO })) fields.get(id).value = String(value ?? '');
  }
  return { win, api, fields, field, vault, persistence, options, storage, host, main: () => clone(main), snapshots: () => clone(snapshots),
    current: () => api.captureCurrentUserDataReadOnly({ base: main }),
    save: () => api.saveUserDataWithReceipt(options),
    write: () => api.saveMainSessionNow({ ...options, force: true }),
    replaceMain(value) { main = clone(value); },
    setUi(value) { docproUi = clone(value); }, ui: () => clone(docproUi),
    changeAccount() { owner = 'fictional-other-native-carry-owner'; generation++; },
    rotateSession() { generation++; },
    setFields() { for (const [id, value] of Object.entries({ name: source.name, age: source.user.age, ageMonths: source.user.ageMonths, sex: source.user.sex, weight: source.user.weight, height: source.user.height, dobInput: source.user.dobISO })) fields.get(id).value = String(value ?? ''); },
  };
}

describe('native Save preserves authorized unmounted fields without changing their owner', () => {
  it.each([1.8, 1.6])('commits manual PAL %s and independent histories from the successful current carrier', async pal => {
    const source = record(); source.plan.palFactor = pal; source.intake.pal = String(pal);
    const h = environment(source), before = h.main(), current = h.current();
    expect(before.plan).toMatchObject(source.plan);
    const receipt = await h.save(); expect(receipt).toMatchObject({ saved: true, referenceVerified: true });
    const saved = h.snapshots()[0];
    expect(saved.plan).toEqual(current.plan); expect(saved.intake).toEqual(current.intake);
    expect(saved.growthBasic.data).toEqual(source.growthBasic.data);
    expect(saved.advanced.data.measurements).toEqual(before.advanced.data.measurements);
    expect(h.main()).toEqual(before);
    expect(h.api.getCommittedSaveWitness({ patientId: PID, snapshotId: receipt.snapshotId,
      applySequence: h.api.getApplyLoadedDataSequence() }).payload).toEqual(saved);
  });

  it('preserves an imported PAL and unknown clinical metadata without inferring a manual choice', async () => {
    const source = record(); delete source.plan.palWybrany;
    source.plan.foreignMetadata = { origin: 'fictional import', fields: [null, false, { unknown: 9 }] };
    const h = environment(source), working = h.current();
    expect((await h.save()).saved).toBe(true);
    expect(h.snapshots()[0].plan).toEqual(working.plan);
    expect(h.snapshots()[0].plan.palFactor).toBe(1.8);
    expect(h.snapshots()[0].plan.foreignMetadata).toEqual(source.plan.foreignMetadata);
  });

  it('saves immediate owned measurement edits and mounted explicit blanks instead of older carried values', async () => {
    const h = environment(); h.fields.get('weight').value = '49'; h.fields.get('height').value = '161';
    h.fields.set('palFactor', h.field('palFactor')); h.fields.set('intakePal', h.field('intakePal'));
    h.fields.set('basicGrowthMeasurements', h.field('basicGrowthMeasurements'));
    h.fields.set('intakeMeasurements', h.field('intakeMeasurements'));
    h.win.basicGrowthData = { measurements: [] }; h.win.intakeHistory = []; h.win.intakeEstimatedKcalPerDay = null;
    const receipt = await h.save(); expect(receipt.saved).toBe(true);
    expect(h.snapshots()[0]).toMatchObject({ user: { height: 161, weight: 49 }, plan: { palFactor: null },
      intake: { pal: null, history: [], estKcalPerDay: null }, growthBasic: { data: { measurements: [] } } });
  });

  it.each([null, { measurements: [] }])('keeps an explicit independent basic clear %j', async data => {
    const source = record(); source.growthBasic.data = data;
    const h = environment(source); expect((await h.save()).saved).toBe(true);
    expect(h.snapshots()[0].growthBasic.data).toEqual(data);
  });

  it.each(['account', 'key-session', 'same-pid-visit', 'different-pid', 'unwitnessed-carrier', 'adapter'])('refuses %s required carry without touching durable records', async cause => {
    const h = environment(), before = h.snapshots();
    if (cause === 'account') h.changeAccount();
    if (cause === 'key-session') h.rotateSession();
    if (cause === 'same-pid-visit') h.win.VildaPanelPacjent.invalidateWriteAuthority();
    if (cause === 'different-pid') h.storage.set('vildaCurrentPatientId', 'fictional-other-patient-same-name');
    if (cause === 'unwitnessed-carrier') { const next = h.main(); next.plan.palFactor = 2; h.replaceMain(next); }
    if (cause === 'adapter') h.win.VildaPersistence = { ...h.persistence };
    const result = await h.save(); expect(result?.saved).not.toBe(true);
    expect(h.vault.savePatient).not.toHaveBeenCalled(); expect(h.snapshots()).toEqual(before);
  });

  it('refreshes proof only after a successful current writer and preserves a newly owned edit on Save', async () => {
    const h = environment(); h.fields.set('palFactor', h.field('palFactor', 1.7));
    h.fields.set('intakePal', h.field('intakePal', 1.7)); expect(h.write()).toBe(true);
    h.fields.delete('palFactor'); h.fields.delete('intakePal'); h.fields.get('height').value = '162';
    expect((await h.save()).saved).toBe(true);
    expect(h.snapshots()[0]).toMatchObject({ plan: { palFactor: 1.7 }, intake: { pal: '1.7' }, user: { height: 162 } });
  });

  it.each([true, false])('continues only the actual rejected native Save cleanup before its next attempt (merged=%s)', async merged => {
    const h = environment(), before = h.main(), originalTicket = h.win.VildaPanelPacjent.captureWriteAuthority();
    const target = 'fictional-native-merge-target';
    const rejection = Object.assign(new Error('Fictional deleted record'), { code: 'PATIENT_DELETED',
      patientId: PID, mergedIntoPatientId: merged ? target : null, mergedIntoSameIdentity: merged });
    h.vault.savePatient.mockRejectedValueOnce(rejection);
    expect((await h.save()).saved).toBe(false);
    expect(h.vault.savePatient.mock.calls[0][1].patientId).toBe(PID);
    expect(h.storage.get('vildaCurrentPatientId')).toBeUndefined();
    expect(h.win.VildaPanelPacjent.isWriteAuthorityCurrent(originalTicket)).toBe(false);
    expect(h.snapshots()).toEqual([]); expect(h.main()).toEqual(before);
    h.fields.get('height').value = '162';
    const result = await h.save(); expect(result.saved).toBe(true);
    const options = h.vault.savePatient.mock.calls[1][1];
    if (merged) expect(options).toMatchObject({ patientId: target, dolaczPoScaleniu: PID });
    else expect(options).not.toHaveProperty('patientId');
    expect(h.snapshots()[0]).toMatchObject({ user: { height: 162 }, plan: { palFactor: 1.8 }, intake: { pal: '1.8' } });
    expect(h.main()).toEqual(before);
  });

  it.each(['account', 'key', 'adapter', 'carrier', 'visit', 'clear'])('cannot continue a rejected native Save after %s changed', async cause => {
    const h = environment();
    h.vault.savePatient.mockImplementationOnce(async () => {
      if (cause === 'account') h.changeAccount();
      if (cause === 'key') h.rotateSession();
      if (cause === 'adapter') h.win.VildaPersistence = { ...h.persistence };
      if (cause === 'carrier') { const changed = h.main(); changed.plan.palFactor = 2; h.replaceMain(changed); }
      if (cause === 'visit') h.win.VildaPanelPacjent.invalidateWriteAuthority();
      if (cause === 'clear') { const old = h.main(); h.api.clearMainSessionStorage(); h.replaceMain(old); }
      throw Object.assign(new Error('Fictional deleted record'), { code: 'PATIENT_DELETED', patientId: PID,
        mergedIntoPatientId: 'fictional-target', mergedIntoSameIdentity: true });
    });
    expect((await h.save()).saved).toBe(false);
    expect((await h.save()).saved).toBe(false);
    expect(h.vault.savePatient).toHaveBeenCalledTimes(1); expect(h.snapshots()).toEqual([]);
  });

  it.each(['account', 'key', 'adapter', 'visit', 'clear'])('rejects reentrant %s during its own failed-Save PID cleanup', async cause => {
    const h = environment(), remove = h.win.sessionStorage.removeItem;
    h.win.sessionStorage.removeItem = key => {
      remove(key);
      if (key !== 'vildaCurrentPatientId') return;
      if (cause === 'account') h.changeAccount();
      if (cause === 'key') h.rotateSession();
      if (cause === 'adapter') h.win.VildaPersistence = { ...h.persistence };
      if (cause === 'visit') h.win.VildaPanelPacjent.invalidateWriteAuthority();
      if (cause === 'clear') { const old = h.main(); h.api.clearMainSessionStorage(); h.replaceMain(old); }
    };
    h.vault.savePatient.mockRejectedValueOnce(Object.assign(new Error('Fictional deleted record'), { code: 'PATIENT_DELETED',
      patientId: PID, mergedIntoPatientId: 'fictional-target', mergedIntoSameIdentity: true }));
    expect((await h.save()).saved).toBe(false); expect((await h.save()).saved).toBe(false);
    expect(h.vault.savePatient).toHaveBeenCalledTimes(1); expect(h.snapshots()).toEqual([]);
  });

  it('a new accepted visit after a rejected Save cannot inherit the abandoned retry carry', async () => {
    const h = environment();
    h.vault.savePatient.mockRejectedValueOnce(Object.assign(new Error('Fictional deletion'), { code: 'PATIENT_DELETED', patientId: PID }));
    expect((await h.save()).saved).toBe(false);
    const next = record(); next.name = 'Fikcyjny Inny Pacjent'; next.plan.palFactor = 1.6; next.intake.pal = '1.6';
    h.api.applyLoadedData(next, h.options); h.setFields();
    expect((await h.save()).saved).toBe(true);
    expect(h.snapshots()[0]).toMatchObject({ plan: { palFactor: 1.6 }, intake: { pal: '1.6' } });
    expect(h.vault.savePatient.mock.calls[1][1]).not.toHaveProperty('dolaczPoScaleniu');
  });

  it('preserves standalone compatibility without a panel module', async () => {
    const h = environment(record(), { panel: false });
    expect((await h.save()).saved).toBe(true); expect(h.snapshots()[0].plan.palFactor).toBe(1.8);
  });

  it('allows the first fresh native form save without an old carrier', async () => {
    const h = environment(record(), { patientId: null, load: false }); h.setFields();
    expect((await h.save()).saved).toBe(true); expect(h.snapshots()).toHaveLength(1);
    expect(h.snapshots()[0].user).toMatchObject({ height: 158, weight: 46 });
  });

  it('adopts a new patient ID only through its verified own Save and keeps the next edited Save complete', async () => {
    const h = environment(record(), { patientId: null });
    const first = await h.save(); expect(first).toMatchObject({ saved: true, referenceVerified: true, patientId: PID });
    h.fields.get('height').value = '164';
    const second = await h.save(); expect(second).toMatchObject({ saved: true, referenceVerified: true, patientId: PID });
    expect(h.snapshots()).toHaveLength(2);
    expect(h.snapshots()[1]).toMatchObject({ user: { height: 164 }, plan: { palFactor: 1.8 }, intake: { pal: '1.8' } });
    expect(h.snapshots()[0].user.height).toBe(158);
  });

  it('does not adopt an externally assigned ID merely because the names match', async () => {
    const h = environment(record(), { patientId: null }); h.storage.set('vildaCurrentPatientId', PID);
    expect((await h.save()).saved).toBe(false); expect(h.snapshots()).toEqual([]);
  });

  it.each(['before-collect', 'queued'])('real shell activation A→B→A invalidates required carry %s', async phase => {
    const h = environment(record(), { shell: true });
    expect(h.win.VildaPanelPacjent.captureWriteAuthority()).not.toBeNull();
    expect(h.main()?.plan.palFactor).toBe(1.8);
    const operation = phase === 'queued' ? h.save() : null;
    h.host.shell.navigate('start'); h.host.shell.navigate('docpro');
    const result = await (operation || h.save());
    expect(result.saved).toBe(false); expect(h.vault.savePatient).not.toHaveBeenCalled(); expect(h.snapshots()).toEqual([]);
    // A real new publication by the reactivated document establishes its own
    // current carrier; the stale ticket itself never becomes valid again.
    expect(h.write()).toBe(true); expect((await h.save()).saved).toBe(true);
  });

  it('refuses a carrier that changes during the projection read', async () => {
    const h = environment(), originalRead = h.persistence.readMainSession.getMockImplementation();
    h.persistence.readMainSession.mockImplementationOnce(() => {
      const value = originalRead(); h.win.VildaPanelPacjent.invalidateWriteAuthority(); return value;
    });
    expect((await h.save()).saved).toBe(false); expect(h.snapshots()).toEqual([]);
  });

  it('refuses an existing imported carrier until an accepted current writer has proven its scope', async () => {
    const h = environment(record(), { load: false }); h.setFields(); h.replaceMain(record());
    expect((await h.save()).saved).toBe(false); expect(h.vault.savePatient).not.toHaveBeenCalled();
    expect(h.snapshots()).toEqual([]); expect(h.main()).toEqual(record());
  });

  it('a failed main write cannot refresh a prior carrier proof', async () => {
    const h = environment(); h.fields.set('palFactor', h.field('palFactor', 1.9));
    h.persistence.writeMainSession = () => false; expect(h.write()).toBe(false);
    const replacement = h.main(); replacement.plan.palFactor = 1.9; h.replaceMain(replacement); h.fields.delete('palFactor');
    expect((await h.save()).saved).toBe(false); expect(h.snapshots()).toEqual([]);
  });

  it('retains native ownership through the ordinary collector wrapper', async () => {
    const h = environment(); h.options.collectUserData = () => h.api.collectUserData();
    expect((await h.save()).saved).toBe(true);
    expect(h.snapshots()[0]).toMatchObject({ plan: { palFactor: 1.8 }, intake: { pal: '1.8' } });
  });

  it('treats a cached complete native result as the explicit supplied payload after a subsequent load', async () => {
    const h = environment(), cached = h.api.collectUserData(); cached.plan.palFactor = 1.9;
    const otherVisit = record(); otherVisit.plan.palFactor = 1.7;
    h.api.applyLoadedData(otherVisit, h.options);
    const receipt = await h.api.saveUserDataWithReceipt({ collectUserData: () => cached });
    expect(receipt.saved).toBe(true); expect(h.snapshots()[0].plan.palFactor).toBe(1.9);
  });

  it('clearing the main session invalidates proof even if the same old JSON reappears', async () => {
    const h = environment(), prior = h.main();
    h.api.clearMainSessionStorage(); h.replaceMain(prior);
    expect((await h.save()).saved).toBe(false); expect(h.snapshots()).toEqual([]);
  });

  it('keeps an explicit complete collector override independent from DOM ownership', async () => {
    const h = environment(), supplied = clone(record()); supplied.plan.palFactor = 1.9;
    h.changeAccount();
    const receipt = await h.api.saveUserDataWithReceipt({ collectUserData: () => clone(supplied) });
    expect(receipt.saved).toBe(true); expect(h.snapshots()[0].plan.palFactor).toBe(1.9);
  });
});


const clearedSgaUi = () => ({ version: 5, controls: { fictionalOtherControl: false },
  moduleStates: { sgaBirth: { weeks: '39', hasComputed: true, assessment: { computedAtISO: '2025-01-01T12:00:00Z', fictionalOldResult: -3.1 } },
    sgaBirthUi: { version: 1, prefillCleared: true, ownerId: 'fictional-native-carry-owner', patientId: PID },
    otherClinicalUi: { collapsed: true, opaque: ['keep', null] } }, customFutureKey: { preserve: 7 } });
const savedBirth = () => ({ version: 1, weeks: '35', days: '2', sex: 'female', weight: '1810',
  sourceChoice: 'niklasson', sourceKeys: ['niklasson'], hasComputed: true,
  assessment: { version: 1, computedAtISO: '2026-11-01T12:00:00Z', requestedSourceKeys: ['niklasson'],
    sources: [{ sourceKey: 'niklasson', metrics: { weight: { sds: -2.1 } } }] } });
function attachBirthApi(h) {
  let value = { weeks: '39', fictionalWorkingEdit: true };
  const api = { captureState: () => clone(value),
    resetState: vi.fn(() => { value = null; }), restoreState: vi.fn(next => { value = clone(next); }) };
  h.win.vildaSgaBirthPersistApi = api;
  return { api, current: () => clone(value) };
}

describe('accepted native patient lifecycle owns the SGA visit clear marker', () => {
  it('a same-PID accepted load removes only SGA UI state and restores the selected assessment exactly', () => {
    const h = environment(), ui = clearedSgaUi(), source = record(); source.birth = savedBirth();
    h.setUi(ui); const birth = attachBirthApi(h);
    h.api.applyLoadedData(source, h.options);
    const expected = clone(ui); delete expected.moduleStates.sgaBirthUi; delete expected.moduleStates.sgaBirth;
    expect(h.ui()).toEqual(expected); expect(h.persistence.writeDocproUi).toHaveBeenCalledOnce();
    expect(birth.api.resetState).toHaveBeenCalledWith({ hideCard: true });
    expect(birth.current()).toEqual(savedBirth()); expect(h.win.vildaBirthData).toEqual(savedBirth());
    expect(source.birth).toEqual(savedBirth());
  });

  it.each([savedBirth(), null])('native accepted Restore restores the actual saved birth %j', value => {
    const h = environment(), ui = clearedSgaUi(), source = record(); source.birth = clone(value);
    h.setUi(ui); const birth = attachBirthApi(h);
    h.api.restoreLoadedState({ ...h.options, data: source });
    const expected = clone(ui); delete expected.moduleStates.sgaBirthUi; delete expected.moduleStates.sgaBirth;
    expect(h.ui()).toEqual(expected); expect(birth.api.resetState).toHaveBeenCalledOnce();
    expect(birth.current()).toEqual(value); expect(h.win.vildaBirthData).toEqual(value);
    expect(source.birth).toEqual(value);
  });

  it('session restore uses the SGA session hydrator while explicit load/Restore use record restoration', () => {
    const h = environment(), source = { ...record(), birth: savedBirth() }, birth = attachBirthApi(h);
    birth.api.restoreSessionState = vi.fn();
    h.api.applyLoadedData(source, { ...h.options, isSessionRestore: true });
    expect(birth.api.restoreSessionState).toHaveBeenCalledWith(savedBirth()); expect(birth.api.restoreState).not.toHaveBeenCalled();
    birth.api.restoreSessionState.mockClear();
    h.api.applyLoadedData(source, h.options);
    h.api.restoreLoadedState({ ...h.options, data: source });
    expect(birth.api.restoreSessionState).not.toHaveBeenCalled(); expect(birth.api.restoreState).toHaveBeenCalledTimes(2);
    expect(source.birth).toEqual(savedBirth());
  });

  it('session restore keeps the existing fallback for an older SGA module', () => {
    const h = environment(), birth = attachBirthApi(h);
    h.api.applyLoadedData({ ...record(), birth: savedBirth() }, { ...h.options, isSessionRestore: true });
    expect(birth.api.restoreState).toHaveBeenCalledWith(savedBirth());
  });

  it('a canceled Restore preserves both the complete UI draft and local SGA edits', () => {
    const h = environment(), ui = clearedSgaUi(); h.setUi(ui); const birth = attachBirthApi(h), before = birth.current();
    h.win.confirm = () => false;
    h.api.restoreLoadedState({ ...h.options, data: { ...record(), birth: savedBirth() }, anyDataEntered: () => true });
    expect(h.ui()).toEqual(ui); expect(birth.current()).toEqual(before);
    expect(h.persistence.writeDocproUi).not.toHaveBeenCalled(); expect(birth.api.resetState).not.toHaveBeenCalled();
  });

  it('session restoration and own Save preserve the explicit working-visit Clear marker', async () => {
    const h = environment(), ui = clearedSgaUi(); h.setUi(ui);
    h.api.applyLoadedData(record(), { ...h.options, isSessionRestore: true });
    h.setFields(); h.write();
    expect((await h.save()).saved).toBe(true);
    expect(h.ui()).toEqual(ui); expect(h.persistence.writeDocproUi).not.toHaveBeenCalled();
  });

  it.each(['visit', 'account'])('does not rewrite DocPro UI after %s ownership changes during its read', cause => {
    const h = environment(), ui = clearedSgaUi(); h.setUi(ui);
    h.persistence.readDocproUi.mockImplementationOnce(() => {
      if (cause === 'visit') h.win.VildaPanelPacjent.invalidateWriteAuthority(); else h.changeAccount();
      return clone(ui);
    });
    h.api.applyLoadedData(record(), h.options);
    expect(h.ui()).toEqual(ui); expect(h.persistence.writeDocproUi).not.toHaveBeenCalled();
  });

  it('a cross-page accepted load clears the stale SGA UI marker even when that page has no SGA API', () => {
    const h = environment(), ui = clearedSgaUi(); h.setUi(ui); h.win.location.pathname = '/kalkulator-klirens.html';
    h.api.applyLoadedData({ ...record(), birth: savedBirth() }, h.options);
    const expected = clone(ui); delete expected.moduleStates.sgaBirthUi; delete expected.moduleStates.sgaBirth;
    expect(h.ui()).toEqual(expected); expect(h.win.vildaBirthData).toEqual(savedBirth());
  });

  it('a same-PID load of explicit birth:null removes the prior computed SGA UI mirror without needing a Clear marker', () => {
    const h = environment(), ui = clearedSgaUi(); delete ui.moduleStates.sgaBirthUi; h.setUi(ui);
    const birth = attachBirthApi(h);
    h.api.applyLoadedData({ ...record(), birth: null }, h.options);
    const expected = clone(ui); delete expected.moduleStates.sgaBirth;
    expect(h.ui()).toEqual(expected); expect(birth.current()).toBeNull(); expect(h.win.vildaBirthData).toBeNull();
  });

  it('a legacy UI draft without the marker is left byte-for-byte untouched', () => {
    const h = environment(), ui = clearedSgaUi(); delete ui.moduleStates.sgaBirthUi; delete ui.moduleStates.sgaBirth; h.setUi(ui);
    h.api.restoreLoadedState({ ...h.options, data: record() });
    expect(h.ui()).toEqual(ui); expect(h.persistence.writeDocproUi).not.toHaveBeenCalled();
  });
});

function attachGrowthHooks(h) {
  const order = [], tokens = [];
  h.win.vildaBeginGrowthHistoryRestore = vi.fn(presence => {
    order.push('begin');
    if (presence === null) return null;
    const token = Object.freeze({ opaque: tokens.length }); tokens.push(token); return token;
  });
  h.win.vildaCommitGrowthHistoryRestore = vi.fn(token => { order.push('commit'); return tokens.includes(token); });
  h.win.vildaEnsureAdvancedIntakePairing = vi.fn(() => order.push('pair'));
  const options = { ...h.options,
    rehydrateAdvancedFromState: () => order.push('advanced'),
    rehydrateIntakeFromState: () => order.push('intake'),
  };
  return { order, tokens, options, begin: h.win.vildaBeginGrowthHistoryRestore, commit: h.win.vildaCommitGrowthHistoryRestore };
}

describe('DIX passes bounded source intent to passive growth restoration', () => {
  it('notifies basic-name listeners only after the independent source history is hydrated', () => {
    const h = environment(), source = record(); source.growthBasic.name = source.name;
    let mountedRows = []; const observed = [];
    h.fields.set('basicGrowthName', { ...h.field('basicGrowthName'), dispatchEvent(event) {
      if (event.type === 'input' && this.value === source.name && h.win.basicGrowthData?.customVersion === source.growthBasic.data.customVersion) observed.push(clone(mountedRows));
    } });
    h.win.vildaRehydrateBasicGrowthFromState = () => { mountedRows = clone(h.win.basicGrowthData?.measurements || []); };
    h.api.applyLoadedData(source, h.options);
    expect(observed).toEqual([source.growthBasic.data.measurements]);
  });

  it.each(['explicit', 'absent', 'null', 'future'])('distinguishes %s histories and commits only after synchronous hydration', shape => {
    const h = environment(), hooks = attachGrowthHooks(h), source = record();
    if (shape === 'absent') { delete source.advanced; delete source.intake; delete source.growthBasic; }
    if (shape === 'null') { source.advanced = null; source.intake = null; source.growthBasic = null; }
    if (shape === 'future') { source.advanced = 'future'; source.intake = ['future']; source.growthBasic = 42; }
    h.api.applyLoadedData(source, hooks.options);
    expect(hooks.begin).toHaveBeenCalledWith({ advanced: shape !== 'absent', intake: shape !== 'absent', basic: shape !== 'absent' });
    expect(hooks.commit).toHaveBeenCalledWith(hooks.tokens[0]);
    expect(hooks.order.indexOf('begin')).toBeLessThan(hooks.order.indexOf('advanced'));
    expect(hooks.order.indexOf('advanced')).toBeLessThan(hooks.order.indexOf('commit'));
    expect(hooks.order.indexOf('intake')).toBeLessThan(hooks.order.indexOf('commit'));
    expect(hooks.order.indexOf('commit')).toBeLessThan(hooks.order.indexOf('pair'));
  });

  it.each(['object', 'empty', 'null', 'missing'])('passes the accepted basic %s source without borrowing a later global', shape => {
    const h = environment(), source = record(), calls = [];
    if (shape === 'empty') source.growthBasic.data = { measurements: [] };
    if (shape === 'null') source.growthBasic.data = null;
    if (shape === 'missing') delete source.growthBasic.data;
    const expected = clone(source.growthBasic);
    h.win.vildaRehydrateBasicGrowthFromState = options => { calls.push(options); };
    h.api.applyLoadedData(source, h.options);
    expect(calls).toHaveLength(2);
    for (const options of calls) {
      if (shape === 'missing') expect(options || {}).not.toHaveProperty('data');
      else expect(options).toHaveProperty('data', expected.data);
    }
    expect(source.growthBasic).toEqual(expected);
  });

  it('hydrates the accepted basic source before Restore publishes puberty notifications', () => {
    const h = environment(), source = record(); let mountedRows = null, notifiedRows = null;
    h.win.vildaRehydrateBasicGrowthFromState = vi.fn(options => { mountedRows = clone(options.data.measurements); });
    h.win.VildaPubertyAssessmentState = { applyToUser() {}, mergeSession(target, incoming, merge) { merge(target, incoming); },
      load() { notifiedRows = clone(mountedRows); } };
    h.api.restoreLoadedState({ ...h.options, data: source });
    expect(h.win.vildaRehydrateBasicGrowthFromState).toHaveBeenCalledOnce();
    expect(notifiedRows).toEqual(source.growthBasic.data.measurements);
  });

  it('an asynchronous GH completion never rehydrates an earlier accepted basic source over a later edit', async () => {
    const h = environment(), hooks = attachGrowthHooks(h); let release;
    const pending = new Promise(resolve => { release = resolve; });
    h.win.vildaRehydrateBasicGrowthFromState = vi.fn();
    h.api.applyLoadedData(record(), { ...hooks.options, importTherapyPointsToAdvancedGrowth: () => pending });
    h.win.vildaRehydrateBasicGrowthFromState.mockClear();
    const edited = { measurements: [{ ageMonths: 102, height: 135, weight: 30 }] }; h.win.basicGrowthData = clone(edited);
    release(); await pending; await Promise.resolve();
    expect(h.win.vildaRehydrateBasicGrowthFromState).not.toHaveBeenCalled(); expect(h.win.basicGrowthData).toEqual(edited);
  });

  it('threads the exact token through accepted Restore before its first pairing call', () => {
    const h = environment(), hooks = attachGrowthHooks(h);
    h.api.restoreLoadedState({ ...hooks.options, data: record() });
    expect(hooks.begin).toHaveBeenCalledOnce(); expect(hooks.commit).toHaveBeenCalledWith(hooks.tokens[0]);
    expect(hooks.order.indexOf('intake')).toBeLessThan(hooks.order.indexOf('commit'));
    expect(hooks.order.indexOf('commit')).toBeLessThan(hooks.order.indexOf('pair'));
  });

  it('a canceled Restore does not begin or commit another history scope', () => {
    const h = environment(), hooks = attachGrowthHooks(h); h.win.confirm = () => false;
    h.api.restoreLoadedState({ ...hooks.options, data: record(), anyDataEntered: () => true });
    expect(hooks.begin).not.toHaveBeenCalled(); expect(hooks.commit).not.toHaveBeenCalled();
  });

  it.each(['account', 'visit', 'new-load'])('a stale asynchronous GH finalizer cannot commit after %s changes', async cause => {
    const h = environment(), hooks = attachGrowthHooks(h); let release;
    const pending = new Promise(resolve => { release = resolve; });
    h.api.applyLoadedData(record(), { ...hooks.options, importTherapyPointsToAdvancedGrowth: () => pending });
    expect(hooks.commit).not.toHaveBeenCalled();
    if (cause === 'account') h.changeAccount();
    if (cause === 'visit') h.win.VildaPanelPacjent.invalidateWriteAuthority();
    if (cause === 'new-load') h.api.applyLoadedData(record(), hooks.options);
    hooks.commit.mockClear(); h.win.vildaEnsureAdvancedIntakePairing.mockClear(); h.win.hasUserModifiedAfterLoad = true;
    release(); await pending; await Promise.resolve();
    expect(hooks.commit).not.toHaveBeenCalled(); expect(h.win.vildaEnsureAdvancedIntakePairing).not.toHaveBeenCalled();
    expect(h.win.hasUserModifiedAfterLoad).toBe(true);
  });

  it('an accepted full Clear resets restoration intent without a replacement payload', () => {
    const h = environment(), hooks = attachGrowthHooks(h); h.api.clearAllData();
    expect(hooks.begin).toHaveBeenCalledWith(null); expect(hooks.commit).not.toHaveBeenCalled();
  });
});


describe('immediate native Save uses only the exact accepted main-session restore', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-07T12:00:00Z')); });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  function restored({ insideApply, beforeRead, prepare, failed = false, shell = false } = {}) {
    const source = record(); source.plan.acceptedMetadata = { fictional: 'original accepted source' };
    source.zscore = { resultsMode: true };
    const h = environment(source, { load: false, shell }); h.win.location.pathname = '/index.html';
    h.fields.set('resultsModeToggle', { ...h.field('resultsModeToggle'), checked: true });
    if (prepare) prepare(h, source);
    h.replaceMain(source);
    const writes = vi.spyOn(h.persistence, 'writeMainSession');
    if (beforeRead) h.persistence.readMainSession.mockImplementationOnce(() => { beforeRead(h); return clone(source); });
    const options = { ...h.options, applyLoadedData(value, restoreOptions) {
      const result = h.api.applyLoadedData(value, { ...h.options, ...restoreOptions });
      if (insideApply) insideApply(h);
      return failed ? false : result;
    } };
    h.api.restoreMainSessionIfAny(options);
    return { ...h, source, writes };
  }

  it('saves a real owned mode edit immediately after accepted restore without waiting for or forcing autosave', async () => {
    const h = restored(); await vi.advanceTimersByTimeAsync(0);
    expect(h.api.getSaveReadiness()).toEqual({ ready: true, reason: null });
    expect(h.api.isMainSessionAutosavePaused()).toBe(true); expect(h.writes).not.toHaveBeenCalled();
    h.fields.get('resultsModeToggle').checked = false;
    const receipt = await h.save(); expect(receipt).toMatchObject({ saved: true, referenceVerified: true });
    expect(h.snapshots()[0]).toMatchObject({ zscore: { resultsMode: false }, plan: { palFactor: 1.8,
      acceptedMetadata: { fictional: 'original accepted source' } } });
    expect(h.writes).not.toHaveBeenCalled(); expect(h.main()).toEqual(h.source);
  });

  async function blankAnonymousStart() {
    const source = record(); source.name = ''; source.user = { sex: 'M', age: null, ageMonths: null, height: null, weight: null };
    source.foreignClinical = { fictional: { unknown: [null, false, 7] } };
    const h = environment(source, { patientId: null, load: false, shell: true, publishPatientOnSave: false });
    h.fields.set('intakePal', h.field('intakePal', '1.8'));
    h.replaceMain(source);
    h.api.restoreMainSessionIfAny({ ...h.options, applyLoadedData(value, options) {
      return h.api.applyLoadedData(value, { ...h.options, ...options });
    } });
    await vi.advanceTimersByTimeAsync(0);
    h.win.document.addEventListener('vilda:patient-loaded', event => {
      if (event.detail.source === 'save') h.storage.set('vildaCurrentPatientId', event.detail.patientId);
    });
    for (const [id, value] of Object.entries({ name: 'Fikcyjny Nowy Pacjent', age: 13, ageMonths: 0, height: 158, weight: 46 })) h.fields.get(id).value = String(value);
    return { ...h, source };
  }

  it('continues the verified first Save from a blank anonymous carrier before the navigation writer runs', async () => {
    const h = await blankAnonymousStart(), source = h.source;
    const mainBefore = h.main(), receipt = await h.save();
    expect(receipt).toMatchObject({ saved: true, referenceVerified: true, patientId: PID });
    const committedBefore = h.api.getCommittedSaveWitness({ patientId: PID, snapshotId: receipt.snapshotId,
      applySequence: h.api.getApplyLoadedDataSequence() });
    expect(committedBefore.payload.user).toMatchObject({ age: 13, ageMonths: 0, height: 158, weight: 46 });
    expect(h.main()).toEqual(mainBefore);
    expect(h.write()).toBe(true);
    expect(h.main().user).toMatchObject({ age: 13, ageMonths: 0, height: 158, weight: 46 });
    expect(h.main().foreignClinical).toEqual(source.foreignClinical);
    expect(h.main().growthBasic).toEqual(committedBefore.payload.growthBasic);
    expect(h.api.getCommittedSaveWitness({ patientId: PID, snapshotId: receipt.snapshotId,
      applySequence: h.api.getApplyLoadedDataSequence() })).toEqual(committedBefore);
    h.fields.get('height').value = '159';
    expect((await h.save()).saved).toBe(true);
    expect(h.snapshots()[1].user.height).toBe(159);
  });

  it.each(['account', 'key', 'visit', 'apply', 'activation', 'carrier', 'adapter'])('cannot continue the first native Save after %s changes during its real commit', async cause => {
    const h = await blankAnonymousStart(), ticket = h.win.VildaPanelPacjent.captureWriteAuthority();
    const commit = h.vault.savePatient.getMockImplementation();
    h.vault.savePatient.mockImplementation(async (payload, options) => {
      const result = await commit(payload, options);
      if (cause === 'account') h.changeAccount();
      if (cause === 'key') h.rotateSession();
      if (cause === 'visit') h.win.VildaPanelPacjent.invalidateWriteAuthority();
      if (cause === 'apply') h.api.applyLoadedData({ ...record(), name: 'Fikcyjny Nowszy Pacjent' }, h.options);
      if (cause === 'activation') { h.host.shell.navigate('start'); h.host.shell.navigate('docpro'); }
      if (cause === 'carrier') { const next = h.main(); next.foreignClinical = { fictional: 'replaced meanwhile' }; h.replaceMain(next); }
      if (cause === 'adapter') h.win.VildaPersistence = { ...h.persistence };
      return result;
    });
    const receipt = await h.save(), after = h.main();
    expect(h.win.VildaPanelPacjent.isWriteAuthorityCurrent(ticket)).toBe(false);
    if (['account', 'key', 'apply'].includes(cause)) expect(receipt.referenceVerified).not.toBe(true);
    if (cause !== 'apply') expect(h.write()).toBe(false);
    expect(h.main()).toEqual(after);
  });

  it('a forged save event or result cannot grant a blank anonymous writer another patient', async () => {
    const h = await blankAnonymousStart(), panel = h.win.VildaPanelPacjent, ticket = panel.captureWriteAuthority();
    expect(panel.completeOwnSaveAuthority(ticket, { patientId: PID, snapshotId: 'fictional-forged' })).toBe(false);
    h.win.document.dispatchEvent(new h.win.CustomEvent('vilda:patient-loaded', { detail: { source: 'save', patientId: PID,
      snapshotId: 'fictional-forged', referenceVerified: true, applySequence: h.api.getApplyLoadedDataSequence() } }));
    expect(panel.isWriteAuthorityCurrent(ticket)).toBe(false);
    const before = h.main(); expect(h.write()).toBe(false); expect(h.main()).toEqual(before); expect(h.snapshots()).toEqual([]);
  });

  it.each(['key', 'visit', 'activation'])('the panel rechecks %s after reading its actual committed receipt', async cause => {
    const h = await blankAnonymousStart(), panel = h.win.VildaPanelPacjent, ticket = panel.captureWriteAuthority();
    const result = await h.vault.savePatient(h.current()), get = h.vault.getCommittedSavePayload;
    h.vault.getCommittedSavePayload = value => {
      const payload = get(value);
      if (cause === 'key') h.rotateSession();
      if (cause === 'visit') panel.invalidateWriteAuthority();
      if (cause === 'activation') { h.host.shell.navigate('start'); h.host.shell.navigate('docpro'); }
      return payload;
    };
    expect(panel.completeOwnSaveAuthority(ticket, result)).toBe(false);
    expect(panel.isWriteAuthorityCurrent(ticket)).toBe(false);
  });

  it('an older first-Save completion cannot replace the newer verified visit continuation', async () => {
    const h = await blankAnonymousStart(), commit = h.vault.savePatient.getMockImplementation(); let release, calls = 0;
    h.vault.savePatient.mockImplementation(async (payload, options) => {
      const result = await commit(payload, options);
      if (++calls === 1) await new Promise(resolve => { release = resolve; });
      return result;
    });
    const older = h.save(); await Promise.resolve(); await Promise.resolve();
    h.fields.get('weight').value = '47';
    const newer = await h.save(); expect(newer).toMatchObject({ saved: true, referenceVerified: true });
    const selector = { patientId: PID, snapshotId: newer.snapshotId, applySequence: h.api.getApplyLoadedDataSequence() };
    const committed = h.api.getCommittedSaveWitness(selector);
    release(); await older;
    expect(h.api.getCommittedSaveWitness(selector)).toEqual(committed);
    expect(h.write()).toBe(true); expect(h.main().user.weight).toBe(47);
    expect(h.main().foreignClinical).toEqual(h.source.foreignClinical);
  });

  it('captures the accepted carrier only after an unlocked auth boot finishes rotating its key session', async () => {
    let ready = false;
    const h = restored({ prepare(value) {
      value.win.VildaAuthUI.isBootReady = () => ready;
      value.win.requestAnimationFrame = callback => setTimeout(callback, 0);
      value.win.cancelAnimationFrame = clearTimeout;
    } });
    expect(h.api.isMainSessionRestorePending()).toBe(true);
    expect(h.api.getApplyLoadedDataSequence()).toBe(0);
    h.rotateSession(); ready = true;
    h.win.document.dispatchEvent({ type: 'vilda:auth-boot-settled' });
    await vi.advanceTimersByTimeAsync(5);
    expect(h.api.getSaveReadiness()).toEqual({ ready: true, reason: null });
    h.fields.get('weight').value = '47';
    expect((await h.save()).saved).toBe(true);
    expect(h.snapshots()[0]).toMatchObject({ user: { weight: 47 }, plan: { palFactor: 1.8 } });
    expect(h.writes).not.toHaveBeenCalled();
  });

  it.each(['explicit', 'startup', 'key-during-read', 'edit-during-read', 'key-in-form-check', 'edit-in-form-check', 'changed-carrier-in-form-check'])('anonymous incoming draft is natively applied only by a current explicit restore (%s)', async cause => {
    const source = record(), h = environment(source, { patientId: null, load: false });
    h.setFields(); h.fields.get('weight').value = '47';
    h.replaceMain(source);
    const options = { ...h.options, applyLoadedData: (value, flags) => h.api.applyLoadedData(value, { ...h.options, ...flags }) };
    if (cause.endsWith('in-form-check')) options.anyDataEntered = () => {
      if (cause === 'key-in-form-check') h.rotateSession();
      if (cause === 'edit-in-form-check') h.fields.get('weight').value = '49';
      if (cause === 'changed-carrier-in-form-check') { const next = clone(source); next.plan.palFactor = 2; h.replaceMain(next); }
      return true;
    };
    h.api.initMainSessionPersistence(options);
    const originalRead = h.persistence.readMainSession.getMockImplementation();
    if (cause === 'key-during-read' || cause === 'edit-during-read') h.persistence.readMainSession.mockImplementationOnce(() => {
      const value = originalRead();
      if (cause === 'key-during-read') h.rotateSession();
      else h.fields.get('weight').value = '49';
      return value;
    });
    const restored = cause === 'startup' ? h.api.restoreMainSessionIfAny(options) : h.win.vildaSession.restore();
    expect(restored).toBe(cause === 'explicit');
    await vi.advanceTimersByTimeAsync(5);
    if (cause === 'explicit') {
      expect(h.fields.get('weight').value).toBe('46');
      expect((await h.save()).saved).toBe(true);
      expect(h.snapshots()[0]).toMatchObject({ plan: { palFactor: 1.8 }, user: { weight: 46 } });
    } else {
      expect(h.fields.get('weight').value).toBe(cause === 'edit-during-read' || cause === 'edit-in-form-check' ? '49' : '47');
      expect(h.api.getApplyLoadedDataSequence()).toBe(0);
      expect((await h.save()).saved).toBe(false); expect(h.snapshots()).toEqual([]);
    }
  });

  it.each([
    { lastName: 'Fikcyjny Bez Pomiaru' },
    { lastName: 'Fikcyjny Bez Pomiaru', firstName: '' },
    { firstName: 'Fikcyjna Anna Maria', lastName: '' },
    {},
  ])('session restore keeps explicit name parts %j and only absent parts use the canonical parser', async parts => {
    const source = record(); source.name = 'Fikcyjny Bez Pomiaru'; Object.assign(source.user, parts);
    if (Object.keys(parts).length) source.name = [parts.lastName, parts.firstName].filter(Boolean).join(' ');
    const h = environment(source, { patientId: null, load: false });
    h.fields.set('firstName', h.field('firstName')); h.fields.set('lastName', h.field('lastName'));
    let canonical = '';
    Object.defineProperty(h.fields.get('name'), 'value', { get: () => canonical, set(value) {
      canonical = String(value); const words = canonical.split(' ');
      h.fields.get('lastName').value = words.shift() || ''; h.fields.get('firstName').value = words.join(' ');
    } });
    expect(h.api.applyLoadedData(source, { ...h.options, isSessionRestore: true })).toBe(true);
    const explicit = Object.keys(parts).length > 0;
    expect(h.fields.get('lastName').value).toBe(explicit ? parts.lastName || '' : 'Fikcyjny');
    expect(h.fields.get('firstName').value).toBe(explicit ? parts.firstName || '' : 'Bez Pomiaru');
    // A subsequent real field edit remains authoritative, with no source alias.
    h.fields.get('lastName').value = 'Fikcyjny Nowy Człon';
    expect(h.api.collectUserData().user.lastName).toBe('Fikcyjny Nowy Człon');
  });

  it('a genuine edited full name is not replaced by older inconsistent carried split parts', () => {
    const source = record(); source.name = 'Fikcyjny Zmieniony'; source.user.lastName = 'Fikcyjny Dawny'; source.user.firstName = '';
    const h = environment(source, { patientId: null, load: false });
    h.fields.set('firstName', h.field('firstName', '')); h.fields.set('lastName', h.field('lastName', ''));
    let canonical = '';
    Object.defineProperty(h.fields.get('name'), 'value', { get: () => canonical, set(value) {
      canonical = String(value); const words = canonical.split(' ');
      h.fields.get('lastName').value = words.shift() || ''; h.fields.get('firstName').value = words.join(' ');
    } });
    expect(h.api.applyLoadedData(source, { ...h.options, isSessionRestore: true })).toBe(true);
    expect(h.fields.get('name').value).toBe('Fikcyjny Zmieniony');
    expect(h.fields.get('lastName').value).toBe('Fikcyjny'); expect(h.fields.get('firstName').value).toBe('Zmieniony');
  });

  it.each(['before-read-account', 'inside-apply-account', 'inside-apply-key', 'inside-apply-activation', 'inside-apply-panel', 'inside-apply-guest', 'before-finalizer-panel', 'before-finalizer-account', 'changed-carrier', 'failed-apply', 'canceled-restore'])('refuses unproved carry after %s without a durable write', async cause => {
    const h = restored({
      shell: cause === 'inside-apply-activation', failed: cause === 'failed-apply',
      beforeRead: cause === 'before-read-account' ? value => value.changeAccount() : null,
      insideApply: cause === 'inside-apply-account' ? value => value.changeAccount()
        : cause === 'inside-apply-key' ? value => value.rotateSession()
        : cause === 'inside-apply-activation' ? value => { value.host.shell.navigate('start'); value.host.shell.navigate('docpro'); }
        : cause === 'inside-apply-panel' ? value => value.win.VildaPanelPacjent.invalidateWriteAuthority()
        : cause === 'inside-apply-guest' ? value => { value.win.VildaAuthUI.isGuestMode = () => true; } : null,
    });
    if (cause === 'before-finalizer-account') h.changeAccount();
    if (cause === 'before-finalizer-panel') h.win.VildaPanelPacjent.invalidateWriteAuthority();
    if (cause === 'changed-carrier') { const changed = h.main(); changed.plan.acceptedMetadata.fictional = 'unaccepted replacement'; h.replaceMain(changed); }
    if (cause === 'canceled-restore') { h.api.clearMainSessionStorage(); h.replaceMain(h.source); }
    await vi.advanceTimersByTimeAsync(0);
    expect(h.writes).not.toHaveBeenCalled();
    expect((await h.save()).saved).toBe(false); expect(h.vault.savePatient).not.toHaveBeenCalled(); expect(h.snapshots()).toEqual([]);
  });

  it('proves only the actually accepted newer Clcr while retaining the immutable raw-main fence', async () => {
    const oldRenal = { version: 2, inputs: { fictionalResult: 'old' } };
    const newRenal = { version: 2, inputs: { fictionalResult: '' } };
    const applied = [];
    const h = restored({ prepare(value, source) {
      source.clcr = clone(oldRenal);
      value.persistence.readClcrSession = () => clone(newRenal);
      value.persistence.writeClcrSession = snapshot => { applied.push(clone(snapshot)); return true; };
    } });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.api.getSaveReadiness().ready).toBe(true);
    expect(applied).toContainEqual(newRenal); expect(applied).not.toContainEqual(oldRenal);
    expect(h.main().clcr).toEqual(oldRenal); expect(h.writes).not.toHaveBeenCalled();
    expect((await h.save()).saved).toBe(true); expect(h.snapshots()[0].clcr).toEqual(newRenal);
    expect(h.writes).not.toHaveBeenCalled(); expect(h.main().clcr).toEqual(oldRenal);
    // The ordinary authorized writer can still establish a proof of its actual
    // current result; it retains the dedicated clear instead of reviving old.
    expect(h.write()).toBe(true); expect(h.main().clcr).toEqual(newRenal);
    expect((await h.save()).saved).toBe(true); expect(h.snapshots()[0].clcr).toEqual(newRenal);
  });

  it('preserves the actual accepted legacy history normalization without rewriting its raw carrier', async () => {
    const h = restored({ prepare(_value, source) {
      source.advanced.data.measurements.push({ ageMonths: 156, height: 158, weight: 46 });
    } });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.api.getSaveReadiness().ready).toBe(true); expect(h.writes).not.toHaveBeenCalled();
    expect(h.win.advancedGrowthData.measurements).not.toContainEqual({ ageMonths: 156, height: 158, weight: 46 });
    expect((await h.save()).saved).toBe(true);
    expect(h.snapshots()[0].advanced.data).toEqual({ measurements: [h.source.advanced.data.measurements[0]] });
    expect(h.main()).toEqual(h.source); expect(h.writes).not.toHaveBeenCalled();
  });

  function restoredStart(options = {}) {
    return restored({ ...options, prepare(h, source) {
      source.bisphos = { indication: 'osteoporoza', drug: 'zomikos', doseNumber: 'maintenance' };
      source.doctor = { isDoctor: true, pwzNumber: 'fictional-license' };
      h.fields.set('intakePal', h.field('intakePal', '1.8'));
      h.fields.set('palFactor', h.field('palFactor', '1.8'));
      if (options.prepare) options.prepare(h, source);
    } });
  }

  it.each(['newer-clcr', 'legacy-history'])('Start saves actual accepted %s with unmounted selections before its first main write', async kind => {
    const newer = { version: 2, inputs: { fictionalResult: '' } };
    const h = restoredStart({ prepare(value, source) {
      if (kind === 'newer-clcr') {
        source.clcr = { version: 2, inputs: { fictionalResult: 'old' } };
        value.persistence.readClcrSession = () => clone(newer);
      } else source.advanced.data.measurements.push({ ageMonths: 156, height: 158, weight: 46 });
    } });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.writes).not.toHaveBeenCalled(); expect(h.main()).toEqual(h.source);
    expect((await h.save()).saved).toBe(true);
    expect(h.snapshots()[0].bisphos).toEqual(h.source.bisphos);
    expect(h.snapshots()[0].doctor).toEqual(h.source.doctor);
    if (kind === 'newer-clcr') expect(h.snapshots()[0].clcr).toEqual(newer);
    else expect(h.snapshots()[0].advanced.data).toEqual({ measurements: [h.source.advanced.data.measurements[0]] });
    expect(h.main()).toEqual(h.source); expect(h.writes).not.toHaveBeenCalled();
    expect(h.write()).toBe(true); expect(h.main().bisphos).toEqual(h.source.bisphos);
    if (kind === 'newer-clcr') expect(h.main().clcr).toEqual(newer);
  });

  it.each(['raw', 'adapter', 'account', 'apply', 'inside-apply-account'])('normalized Start source refuses changed %s without a durable write', async cause => {
    const h = restoredStart({ insideApply: cause === 'inside-apply-account' ? value => value.changeAccount() : null,
      prepare(value, source) {
        source.clcr = { version: 2, inputs: { fictionalResult: 'old' } };
        value.persistence.readClcrSession = () => ({ version: 2, inputs: { fictionalResult: '' } });
      } });
    if (cause === 'raw') { const changed = h.main(); changed.bisphos.drug = 'pamifos'; h.replaceMain(changed); }
    if (cause === 'adapter') h.win.VildaPersistence = { ...h.persistence };
    if (cause === 'account') h.changeAccount();
    if (cause === 'apply') h.win.VildaPanelPacjent.invalidateWriteAuthority();
    const before = h.main(); await vi.advanceTimersByTimeAsync(0);
    expect(h.writes).not.toHaveBeenCalled(); expect((await h.save()).saved).toBe(false);
    expect(h.write()).toBe(false); expect(h.main()).toEqual(before); expect(h.vault.savePatient).not.toHaveBeenCalled();
  });

  it('natural Start writer retains nondefault unmounted DocPro selections before native encrypted Save', async () => {
    const h = restoredStart(); await vi.advanceTimersByTimeAsync(2000);
    h.fields.get('resultsModeToggle').checked = false;
    h.fields.get('weight').value = '48';
    expect(h.api.scheduleMainSessionSave(null, h.options)).toBe(true);
    await vi.advanceTimersByTimeAsync(300);
    expect(h.writes).toHaveBeenCalledTimes(1);
    expect(h.main().bisphos).toEqual(h.source.bisphos);
    expect(h.main().doctor).toEqual(h.source.doctor);
    expect(h.main().user.weight).toBe(48);
    expect(h.main().zscore.resultsMode).toBe(false);
    expect((await h.save()).saved).toBe(true);
    expect(h.snapshots()[0].bisphos).toEqual(h.source.bisphos);
    expect(h.snapshots()[0].doctor).toEqual(h.source.doctor);
  });

  it('Start writer preserves mounted explicit blanks and independent history clears', async () => {
    const h = restoredStart(); await vi.advanceTimersByTimeAsync(0);
    for (const id of ['bisphosIndication', 'bisphosDrug', 'bisphosDoseNumber', 'pwzNumber']) h.fields.set(id, h.field(id));
    h.fields.set('isDoctor', { ...h.field('isDoctor'), checked: false });
    h.fields.set('basicGrowthMeasurements', h.field('basicGrowthMeasurements'));
    h.fields.set('intakeMeasurements', h.field('intakeMeasurements'));
    h.win.basicGrowthData = { measurements: [] }; h.win.intakeHistory = []; h.win.intakeEstimatedKcalPerDay = null;
    expect(h.write()).toBe(true);
    expect(h.main()).toMatchObject({ bisphos: { indication: null, drug: null, doseNumber: null },
      doctor: { isDoctor: false, pwzNumber: null }, growthBasic: { data: { measurements: [] } },
      intake: { history: [], estKcalPerDay: null } });
    expect((await h.save()).saved).toBe(true);
    expect(h.snapshots()[0].bisphos.drug).toBeNull();
  });

  it('Start writer retains the dedicated renal explicit clear after owned-field projection', async () => {
    const h = restoredStart(); await vi.advanceTimersByTimeAsync(0);
    const dedicated = { version: 2, inputs: { fictionalResult: '' } };
    h.persistence.readClcrSession = () => clone(dedicated);
    expect(h.write()).toBe(true); expect(h.main().clcr).toEqual(dedicated);
    expect(h.main().bisphos).toEqual(h.source.bisphos);
  });

  it.each(['account', 'key', 'panel', 'patient', 'carrier', 'activation'])('natural Start writer refuses %s-stale carry without changing main or Vault', async cause => {
    const h = restoredStart({ shell: cause === 'activation' }); await vi.advanceTimersByTimeAsync(0);
    if (cause === 'account') h.changeAccount();
    if (cause === 'key') h.rotateSession();
    if (cause === 'panel') h.win.VildaPanelPacjent.invalidateWriteAuthority();
    if (cause === 'patient') h.storage.set('vildaCurrentPatientId', 'fictional-other-patient');
    if (cause === 'carrier') { const changed = h.main(); changed.bisphos.drug = 'pamifos'; h.replaceMain(changed); }
    if (cause === 'activation') { h.host.shell.navigate('start'); h.host.shell.navigate('docpro'); }
    const before = h.main();
    expect(h.write()).toBe(false); expect(h.writes).not.toHaveBeenCalled(); expect(h.main()).toEqual(before);
    expect((await h.save()).saved).toBe(false); expect(h.vault.savePatient).not.toHaveBeenCalled();
  });

  it('Start writer refuses an existing required carrier without accepted-source or successful-write proof', async () => {
    const h = restoredStart({ failed: true }); await vi.advanceTimersByTimeAsync(0);
    const before = h.main(); expect(h.write()).toBe(false);
    expect(h.writes).not.toHaveBeenCalled(); expect(h.main()).toEqual(before);
    expect((await h.save()).saved).toBe(false); expect(h.vault.savePatient).not.toHaveBeenCalled();
  });

  it('Start writer rechecks exact carrier after the dedicated renal reader', async () => {
    const h = restoredStart(); await vi.advanceTimersByTimeAsync(0);
    let reads = 0; const changed = h.main(); changed.bisphos.drug = 'pamifos';
    h.persistence.readClcrSession = () => { if (++reads === 2) h.replaceMain(changed); return null; };
    expect(h.write()).toBe(false); expect(h.writes).not.toHaveBeenCalled(); expect(h.main()).toEqual(changed);
    expect(h.vault.savePatient).not.toHaveBeenCalled();
  });

  it.each(['during-renal-read', 'during-final-main-read'])('Start writer refuses an adapter exchange %s', async phase => {
    const h = restoredStart(); await vi.advanceTimersByTimeAsync(0);
    const before = h.main(), otherWrite = vi.fn(() => true);
    const other = { ...h.persistence, writeMainSession: otherWrite };
    let renalReads = 0;
    h.persistence.readClcrSession = () => {
      if (++renalReads === 2) {
        if (phase === 'during-renal-read') h.win.VildaPersistence = other;
        else h.persistence.readMainSession.mockImplementationOnce(() => { h.win.VildaPersistence = other; return clone(before); });
      }
      return null;
    };
    expect(h.write()).toBe(false); expect(h.writes).not.toHaveBeenCalled();
    expect(otherWrite).not.toHaveBeenCalled(); expect(h.main()).toEqual(before);
  });

  it('a queued Start native Save cannot survive a same-PID visit invalidation after a valid natural write', async () => {
    const h = restoredStart(); await vi.advanceTimersByTimeAsync(0);
    expect(h.write()).toBe(true); const before = h.main();
    const operation = h.save(); h.win.VildaPanelPacjent.invalidateWriteAuthority();
    expect((await operation).saved).toBe(false);
    expect(h.vault.savePatient).not.toHaveBeenCalled(); expect(h.main()).toEqual(before);
  });

  it('Start complete custom collectors keep their explicit payload contract', async () => {
    const h = restoredStart(); await vi.advanceTimersByTimeAsync(0);
    const explicit = h.api.collectUserData(); explicit.bisphos = { indication: null, drug: null, doseNumber: null };
    expect(h.api.saveMainSessionNow({ force: true, collectUserData: () => explicit })).toBe(true);
    expect(h.main().bisphos).toEqual(explicit.bisphos);
  });

  it('a nested accepted New supersedes the restore and saves only its own carry', async () => {
    const next = record(); next.plan = { palFactor: 1.7, palWybrany: true, acceptedMetadata: { fictional: 'new accepted visit' } };
    const h = restored({ insideApply(value) { value.api.applyLoadedData(next, value.options); value.setFields(); } });
    await vi.advanceTimersByTimeAsync(0);
    const receipt = await h.save(); expect(receipt.saved).toBe(true);
    expect(h.snapshots()[0].plan).toMatchObject(next.plan);
    expect(h.snapshots()[0].plan.acceptedMetadata.fictional).not.toBe('original accepted source');
  });
});


describe('accepted explicit patient load retains its exact caller-owned source through native PID publication', () => {
  const chosen = () => ({ indication: 'osteoporoza', drug: 'zomikos', doseNumber: 'maintenance' });
  function setup() {
    const h = environment(); h.fields.set('intakePal', h.field('intakePal', '1.8'));
    h.fields.set('palFactor', h.field('palFactor', '1.8'));
    const payload = record(); payload.name = 'Fikcyjny Drugi Pacjent'; payload.bisphos = chosen();
    const writes = vi.spyOn(h.persistence, 'writeMainSession');
    return { ...h, payload, writes };
  }
  function publish(h, detail, id = 'fictional-explicit-target') {
    h.win.document.dispatchEvent(new h.win.CustomEvent('vilda:patient-loaded', { detail: { ...detail, patientId: id, source: 'pick' } }));
    // Production custom-fixes publishes the PID during that native event.
    h.storage.set('vildaCurrentPatientId', id);
  }
  function run(h, token, callbacks = {}) {
    return h.api.runAcceptedPatientLoad(token, h.payload, {
      apply: payload => h.api.applyLoadedData(payload, h.options),
      publish: detail => publish(h, detail), ...callbacks,
    });
  }
  it('projects exact accepted fields on first Start write and rebinds only after correlated native publication', async () => {
    const h = setup(), token = h.api.captureAcceptedPatientLoad({ patientId: 'fictional-explicit-target' });
    expect(token).not.toBeNull(); expect(run(h, token)).toBe(true);
    expect(h.main().bisphos).toEqual(chosen()); expect(h.main().name).toBe(h.payload.name);
    h.setFields(); h.fields.get('name').value = h.payload.name;
    expect(h.write()).toBe(true); expect((await h.save()).saved).toBe(true);
    expect(h.snapshots()[0].bisphos).toEqual(chosen());
    expect(h.api.isAcceptedPatientLoadCurrent(token)).toBe(false);
  });
  it.each(['current', 'key-during-publication', 'next-visit'])('continues only its own history owner after accepted PID publication (%s)', async cause => {
    const h = setup(), historyToken = Object.freeze({}); let finish;
    h.win.vildaBeginGrowthHistoryRestore = vi.fn(() => historyToken);
    h.win.vildaCommitGrowthHistoryRestore = vi.fn(token => token === historyToken);
    h.win.vildaAdoptGrowthHistoryAcceptedLoadScope = vi.fn((token, target) => token === historyToken
      && h.storage.get('vildaCurrentPatientId') === target);
    h.options.importTherapyPointsToAdvancedGrowth = () => new Promise(resolve => { finish = resolve; });
    const token = h.api.captureAcceptedPatientLoad({ patientId: 'fictional-explicit-target' });
    const accepted = run(h, token, { publish(detail) {
      publish(h, detail);
      if (cause === 'key-during-publication') h.rotateSession();
    } });
    expect(accepted).toBe(cause !== 'key-during-publication');
    if (cause === 'key-during-publication') expect(h.win.vildaAdoptGrowthHistoryAcceptedLoadScope).not.toHaveBeenCalled();
    else expect(h.win.vildaAdoptGrowthHistoryAcceptedLoadScope).toHaveBeenCalledExactlyOnceWith(historyToken, 'fictional-explicit-target');
    if (cause === 'next-visit') h.win.VildaPanelPacjent.invalidateWriteAuthority();
    finish(); await Promise.resolve(); await Promise.resolve();
    if (cause === 'current') expect(h.win.vildaCommitGrowthHistoryRestore).toHaveBeenCalledWith(historyToken);
    else expect(h.win.vildaCommitGrowthHistoryRestore).not.toHaveBeenCalled();
  });

  it.each(['current', 'key-during-preview'])('correlates accepted Klirens preview without replacing mounted fields (%s)', async cause => {
    const h = setup(); h.fields.set('clcrForm', h.field('clcrForm'));
    h.payload.clcr = { version: 2, inputs: { Scr: '0.4', ScrUnit: 'mg/dl' } };
    h.fields.get('weight').value = '22'; h.fields.get('height').value = '118';
    const token = h.api.captureAcceptedPatientLoad({ patientId: 'fictional-explicit-target' });
    const accepted = run(h, token, { apply(value) {
      const result = h.api.applyLoadedData(value, h.options);
      if (cause === 'key-during-preview') h.rotateSession();
      return result;
    } });
    expect(accepted).toBe(cause === 'current');
    expect(h.fields.get('weight').value).toBe('22'); expect(h.fields.get('height').value).toBe('118');
    if (cause === 'current') {
      expect(h.storage.get('vildaCurrentPatientId')).toBe('fictional-explicit-target');
      expect(h.api.getSaveReadiness().ready).toBe(true);
      expect(h.main()).toMatchObject({ user: { weight: 22, height: 118 }, bisphos: chosen() });
    } else {
      expect(h.storage.get('vildaCurrentPatientId')).toBe(PID);
      expect(h.vault.savePatient).not.toHaveBeenCalled();
    }
  });

  it('accepted load preserves explicit complete custom collector semantics and releases pending readiness', async () => {
    const h = setup(), token = h.api.captureAcceptedPatientLoad({ patientId: 'fictional-explicit-target' });
    const custom = record(); custom.name = h.payload.name; custom.clcr = null;
    custom.bisphos = { indication: 'crmo', drug: 'pamifos', doseNumber: 'subsequent' };
    h.options.collectUserData = () => clone(custom);
    expect(run(h, token)).toBe(true);
    expect(h.main()).toEqual(custom); expect(h.api.getSaveReadiness().ready).toBe(true);
    expect((await h.save()).saved).toBe(true); expect(h.snapshots()[0].bisphos).toEqual(custom.bisphos);
  });
  it('same-PID native Restore carries exact accepted unmounted fields after confirmation', async () => {
    const h = setup(), token = h.api.captureAcceptedPatientLoad({ patientId: 'fictional-explicit-target' });
    expect(run(h, token)).toBe(true);
    h.api.restoreLoadedState({ ...h.options, data: h.payload });
    expect(h.main().bisphos).toEqual(chosen()); expect((await h.save()).saved).toBe(true);
    expect(h.snapshots()[0].bisphos).toEqual(chosen());
  });
  it.each(['account', 'key', 'second-intent', 'different-pid'])('refuses stale %s before applying or publishing', cause => {
    const h = setup(), token = h.api.captureAcceptedPatientLoad({ patientId: 'fictional-explicit-target' }), apply = vi.fn(), pub = vi.fn();
    const before = h.main();
    if (cause === 'account') h.changeAccount();
    if (cause === 'key') h.rotateSession();
    if (cause === 'second-intent') h.api.captureAcceptedPatientLoad({ patientId: 'fictional-other-target' });
    if (cause === 'different-pid') h.storage.set('vildaCurrentPatientId', 'fictional-same-name-other-id');
    expect(run(h, token, { apply, publish: pub })).toBe(false);
    expect(apply).not.toHaveBeenCalled(); expect(pub).not.toHaveBeenCalled(); expect(h.main()).toEqual(before);
  });
  it('same-document refresh without native publication refuses a different target before mutating the form', () => {
    const h = setup(), token = h.api.captureAcceptedPatientLoad({ patientId: 'fictional-explicit-target' });
    const before = h.main(), name = h.fields.get('name').value, seq = h.api.getApplyLoadedDataSequence();
    const apply = vi.fn(payload => h.api.applyLoadedData(payload, h.options));
    expect(run(h, token, { apply, publish: null })).toBe(false);
    expect(apply).not.toHaveBeenCalled(); expect(h.main()).toEqual(before);
    expect(h.fields.get('name').value).toBe(name); expect(h.storage.get('vildaCurrentPatientId')).toBe(PID);
    expect(h.api.getApplyLoadedDataSequence()).toBe(seq); expect(h.api.getSaveReadiness().ready).toBe(true);
  });
  it('a refused callback cannot publish or adopt the selected PID', () => {
    const h = setup(), token = h.api.captureAcceptedPatientLoad({ patientId: 'fictional-explicit-target' }), pub = vi.fn();
    expect(run(h, token, { apply() {}, publish: pub })).toBe(false);
    expect(pub).not.toHaveBeenCalled(); expect(h.storage.get('vildaCurrentPatientId')).toBe(PID);
  });
  it('an account change inside native apply cannot publish or reuse accepted source', () => {
    const h = setup(), token = h.api.captureAcceptedPatientLoad({ patientId: 'fictional-explicit-target' }), pub = vi.fn();
    h.options.syncSharedUserDataFromLoadedData = () => h.changeAccount();
    const before = h.main(); expect(run(h, token, { publish: pub })).toBe(false);
    expect(pub).not.toHaveBeenCalled(); expect(h.main()).toEqual(before);
  });
  it('a different publication PID cannot complete or grant native carry', async () => {
    const h = setup(), token = h.api.captureAcceptedPatientLoad({ patientId: 'fictional-explicit-target' });
    expect(run(h, token, { publish: detail => publish(h, detail, 'fictional-wrong-target') })).toBe(false);
    const before = h.main(); expect(h.write()).toBe(false); expect(h.main()).toEqual(before);
    expect((await h.save()).saved).toBe(false); expect(h.vault.savePatient).not.toHaveBeenCalled();
  });
  it('missing native publication leaves main untouched and blocks native Vault Save', async () => {
    const h = setup(), token = h.api.captureAcceptedPatientLoad({ patientId: 'fictional-explicit-target' }), before = h.main();
    expect(run(h, token, { publish() {} })).toBe(false);
    expect(h.main()).toEqual(before); expect(h.writes).not.toHaveBeenCalled();
    expect(h.api.getSaveReadiness()).toMatchObject({ ready: false, reason: 'accepted-load-pending' });
    expect((await h.save()).saved).toBe(false); expect(h.vault.savePatient).not.toHaveBeenCalled();
  });
  it.each(['unchanged', 'key', 'captured-intent', 'new-apply'])('accepted delayed first write settles only its own current visit (%s)', async cause => {
    vi.useFakeTimers();
    try {
      const h = setup(), token = h.api.captureAcceptedPatientLoad({ patientId: 'fictional-explicit-target' });
      h.persistence.writeMainSession.mockImplementation(value => {
        if (Date.now() < h.win.__vildaPersistClearUntil) return false;
        h.replaceMain(value); return true;
      });
      expect(run(h, token, { publish(detail) { publish(h, detail); h.win.__vildaPersistClearUntil = Date.now() + 50; } })).toBe(true);
      expect(h.api.getSaveReadiness()).toMatchObject({ ready: false, reason: 'accepted-load-pending' });
      const before = h.main();
      if (cause === 'key') h.rotateSession();
      if (cause === 'captured-intent') expect(h.api.captureAcceptedPatientLoad({ patientId: 'fictional-next-target' })).not.toBeNull();
      if (cause === 'new-apply') {
        const newer = clone(h.payload); newer.name = 'Fikcyjny Nowszy Cel';
        newer.bisphos = { indication: 'crmo', drug: 'pamifos', doseNumber: 'subsequent' };
        const next = h.api.captureAcceptedPatientLoad({ patientId: 'fictional-next-target' });
        expect(h.api.runAcceptedPatientLoad(next, newer, { apply: value => h.api.applyLoadedData(value, h.options),
          publish: detail => publish(h, detail, 'fictional-next-target') })).toBe(true);
        expect(h.main().bisphos).toEqual(newer.bisphos); h.writes.mockClear();
      }
      await vi.advanceTimersByTimeAsync(110);
      if (cause === 'new-apply') {
        expect(h.main().bisphos).toEqual({ indication: 'crmo', drug: 'pamifos', doseNumber: 'subsequent' });
        expect(h.writes).not.toHaveBeenCalled(); expect(h.api.getSaveReadiness().ready).toBe(true);
      } else if (cause === 'key') {
        expect(h.main()).toEqual(before); expect((await h.save()).saved).toBe(false);
        expect(h.vault.savePatient).not.toHaveBeenCalled();
      } else {
        expect(h.api.getSaveReadiness().ready).toBe(true); expect(h.main().bisphos).toEqual(chosen());
        h.setFields(); h.fields.get('name').value = h.payload.name;
        expect((await h.save()).saved).toBe(true); expect(h.snapshots()[0].bisphos).toEqual(chosen());
      }
    } finally { vi.clearAllTimers(); vi.useRealTimers(); }
  });

  it('a canceled Restore preserves main and cannot consume accepted payload', () => {
    const h = setup(); h.win.confirm = () => false; const before = h.main();
    h.api.restoreLoadedState({ data: h.payload, anyDataEntered: () => true });
    expect(h.main()).toEqual(before); expect(h.writes).not.toHaveBeenCalled();
  });
});
