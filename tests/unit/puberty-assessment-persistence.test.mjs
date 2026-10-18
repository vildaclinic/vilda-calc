import fs from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

const copy = (value) => JSON.parse(JSON.stringify(value));
const examination = () => ({
  version: 1, sex: 'M', observations: {
    G: { stage: 3, observedAtISO: '2025-02-03', ageMonths: 144, source: 'clinician-entry' },
    Th: null, P: { stage: 2, observedAtISO: null, ageMonths: null, source: null },
  },
});
const payload = (value = examination()) => ({
  version: 1, name: 'Fikcyjny Test Pokwitania',
  user: { sex: 'M', age: 12, ageMonths: 0, height: 145, weight: 35, tannerStage: '4', pubertyAssessment: value },
});
function events() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
    removeEventListener() {},
    dispatchEvent(event) { (listeners.get(event.type) || []).forEach((fn) => fn(event)); return true; },
  };
}
function storage() {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) };
}
function environment({ main = true, session = null, patientId = 'synthetic-a', timers = false, sharedTop = null } = {}) {
  const fields = new Map();
  const doc = { ...events(), readyState: 'loading', getElementById: (id) => fields.get(id) || null,
    querySelector: () => null, querySelectorAll: () => [] };
  ['name', 'advName', 'dobInput', 'age', 'ageMonths', 'height', 'weight', 'sex', 'tannerStage', ...(main ? ['intakePal'] : [])].forEach((id) => {
    fields.set(id, { ...events(), id, value: '', tagName: id === 'sex' || id === 'tannerStage' ? 'SELECT' : 'INPUT',
      style: {}, dataset: {}, classList: { add() {}, remove() {}, contains: () => false },
      setAttribute() {}, removeAttribute() {}, getAttribute: () => null });
  });
  let savedSession = session && copy(session);
  let shared = {};
  let unlocked = true;
  const lockCallbacks = [];
  const win = { ...events(), document: doc, sessionStorage: storage(), localStorage: storage(),
    location: { pathname: main ? '/index.html' : '/docpro.html' },
    setTimeout: timers ? setTimeout : () => 0, clearTimeout: timers ? clearTimeout : () => {}, confirm: () => true,
    Event: class Event { constructor(type, options) { this.type = type; this.bubbles = !!options?.bubbles; } },
    CustomEvent: class CustomEvent { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    VildaVault: { isUnlocked: () => unlocked, onLock: (fn) => lockCallbacks.push(fn) },
    VildaPersistence: {
      getStorage: () => ({}), readMainSession: () => savedSession && copy(savedSession),
      writeMainSession: (value) => { savedSession = copy(value); return true; },
      clearMainSession: () => { savedSession = null; },
      readShared: () => copy(shared), updateShared: (fn) => { fn(shared); return shared; },
      writeShared: (value) => { shared = copy(value); return true; },
      clearUserState: () => { savedSession = null; shared = {}; win.dispatchEvent({ type: 'vilda:user-state-cleared' }); },
      readModuleJSON: (_key, fallback) => fallback,
    },
  };
  win.window = win; win.self = win; win.parent = win; win.top = sharedTop || win;
  if (patientId) win.sessionStorage.setItem('vildaCurrentPatientId', patientId);
  for (const file of ['vilda_dob_age.js', 'vilda_puberty_assessment.js', 'vilda_puberty_assessment_state.js', 'vilda_data_import_export.js']) {
    const source = fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    new Function('window', 'globalThis', 'document', 'setTimeout', 'clearTimeout', source)(win, win, doc, win.setTimeout, win.clearTimeout);
  }
  // A normal page consumes its startup-restore gate before the physician edits.
  // Session fixtures intentionally retain that gate to exercise cold recovery.
  if (session === null) win.VildaDataImportExport.restoreMainSessionIfAny();
  return { win, fields, api: win.VildaDataImportExport, state: win.VildaPubertyAssessmentState,
    session: () => savedSession && copy(savedSession),
    replaceSession: (value) => { savedSession = copy(value); },
    lock: () => { unlocked = false; lockCallbacks.forEach((fn) => fn()); },
  };
}
afterEach(() => vi.useRealTimers());
const options = { showRestoreButton() {}, debouncedUpdate() {}, showLoadDataMessage() {} };
function restore(env, data) {
  expect(env.api.applyLoadedData(data, { ...options, isSessionRestore: true })).toBe(true);
}

describe('typed puberty — real collector and restore preserve opaque examination data', () => {
  it.each([
    examination(),
    { version: 1, sex: 'F', observations: { G: null, Th: null, P: null } },
    { version: 9, observations: ['future'], extra: { opaque: [null, 2, 'a'] } },
    { version: 1, observations: { G: { stage: 'invalid', extra: 42 } } },
    null, 'unsupported primitive', false,
  ])('round-trips supported, empty, future or invalid JSON without normalizing %#', (raw) => {
    const env = environment();
    const source = payload(raw);
    restore(env, source);
    const result = env.api.collectUserData();
    expect(Object.hasOwn(result.user, 'pubertyAssessment')).toBe(true);
    expect(result.user.pubertyAssessment).toEqual(raw);
    expect(source.user.pubertyAssessment).toEqual(raw);
  });

  it('collector and capture return copies; modifying them does not alter the active examination', () => {
    const env = environment(); const original = payload(); restore(env, original);
    original.user.pubertyAssessment.observations.G.stage = 5;
    const first = env.api.collectUserData(); first.user.pubertyAssessment.observations.G.stage = 1;
    env.state.capture().raw.observations.P.stage = 5;
    expect(env.api.collectUserData().user.pubertyAssessment).toEqual(examination());
  });

  it('background latest-head replacement never overwrites the restored visit', () => {
    const env = environment(); restore(env, payload());
    const head = payload(); head.user.pubertyAssessment.observations.G.stage = 5;
    head.user.pubertyAssessment.observations.G.observedAtISO = '2026-10-15';
    env.win.lastLoadedData = head;
    env.win.document.dispatchEvent({ type: 'vilda:baseline-refreshed', detail: { patientId: 'synthetic-a' } });
    expect(env.api.collectUserData().user.pubertyAssessment).toEqual(examination());
    expect(env.state.capture().mode).toBe('restored');
  });

  it('a record loaded for a new measurement retains its original dates without claiming a new examination', () => {
    const env = environment();
    expect(env.api.applyLoadedData(payload(), options)).toBe(true);
    expect(env.state.capture().mode).toBe('loaded');
    expect(env.api.collectUserData().user.pubertyAssessment).toEqual(examination());
    env.api.restoreLoadedState({ ...options, data: payload() });
    expect(env.state.capture().mode).toBe('restored');
    expect(env.api.collectUserData().user.pubertyAssessment.observations.P.observedAtISO).toBeNull();
  });

  it('legacy record without the key clears a previous carrier without inventing G/Th/P', () => {
    const env = environment(); restore(env, payload());
    const legacy = payload(); delete legacy.user.pubertyAssessment;
    env.win.sessionStorage.setItem('vildaCurrentPatientId', 'synthetic-b');
    expect(env.api.applyLoadedData(legacy, options)).toBe(true);
    expect(env.api.collectUserData().user).not.toHaveProperty('pubertyAssessment');
    expect(env.state.capture().present).toBe(false);
  });

  it('clearAllData removes the carrier and cannot reacquire it from the former baseline', () => {
    const env = environment(); restore(env, payload());
    expect(env.api.clearAllData()).toBe(true);
    env.win.lastLoadedData = payload();
    expect(env.api.collectUserData().user).not.toHaveProperty('pubertyAssessment');
  });
});

describe('typed puberty — existing session transport across Start and DocPro', () => {
  it.each([examination(), { version: 9, opaque: [null, false] }, null])('cold guest restore recovers only the hidden assessment after shared fields %#', (raw) => {
    const session = payload(raw);
    session.user.dobISO = '2014-02-26';
    const env = environment({ patientId: null, session });
    env.win.VildaVault.isUnlocked = () => false;
    env.fields.get('name').value = session.name;
    env.fields.get('dobInput').value = '26-02-2014';
    env.fields.get('sex').value = 'M';
    expect(env.api.restoreMainSessionIfAny(options)).toBe(false);
    expect(env.api.collectUserData().user.pubertyAssessment).toEqual(raw);
    expect(env.state.capture().mode).toBe('restored');
    expect(env.fields.get('height').value).toBe('');
    expect(env.fields.get('age').value).toBe('');
    expect(env.fields.get('name').value).toBe(session.name);
  });

  it.each(['name', 'dobInput', 'sex'])('cold guest restore rejects a contradictory %s', (field) => {
    const session = payload(); session.user.dobISO = '2014-02-03';
    const env = environment({ patientId: null, session });
    env.fields.get('name').value = session.name;
    env.fields.get('dobInput').value = session.user.dobISO;
    env.fields.get('sex').value = 'M';
    env.fields.get(field).value = { name: 'Fikcyjna Inna Osoba', dobInput: '2015-01-01', sex: 'F' }[field];
    expect(env.api.restoreMainSessionIfAny(options)).toBe(false);
    expect(env.api.collectUserData().user).not.toHaveProperty('pubertyAssessment');
  });

  it('cold guest restore rejects an invalid displayed birth date', () => {
    const env = environment({ patientId: null, session: payload() });
    env.fields.get('name').value = payload().name;
    env.fields.get('dobInput').value = '31-02-2014';
    expect(env.api.restoreMainSessionIfAny(options)).toBe(false);
    expect(env.api.collectUserData().user).not.toHaveProperty('pubertyAssessment');
  });

  it('normal full-session restoration preserves an assessment without requiring a patient name', () => {
    const session = payload(); session.name = '';
    const env = environment({ patientId: null, session });
    expect(env.api.restoreMainSessionIfAny({ ...options,
      applyLoadedData: (data, loadOptions) => env.api.applyLoadedData(data, { ...options, ...loadOptions }),
    })).toBe(true);
    expect(env.api.collectUserData().user.pubertyAssessment).toEqual(examination());
    expect(env.fields.get('name').value).toBe('');
  });

  it.each([null, { version: 9, extension: { preserve: [null, false] } }])('anonymous F with DOB and a partial mirror recovers unchanged raw %#', (raw) => {
    const session = payload(raw); session.name = '';
    Object.assign(session.user, { sex: 'F', dobISO: '2014-04-14', ageMonths: 6 });
    const env = environment({ patientId: null, session });
    env.fields.get('sex').value = 'F'; env.fields.get('ageMonths').value = '6';
    expect(env.api.restoreMainSessionIfAny(options)).toBe(false);
    expect(env.api.collectUserData().user.pubertyAssessment).toEqual(raw);
    expect(env.fields.get('name').value).toBe('');
  });

  it('a DOB-derived age may advance across a month boundary without invalidating startup recovery', () => {
    const session = payload(); session.name = ''; session.user.dobISO = '2014-04-14';
    const env = environment({ patientId: null, session });
    env.fields.get('ageMonths').value = '1';
    expect(env.api.restoreMainSessionIfAny(options)).toBe(false);
    expect(env.api.collectUserData().user.pubertyAssessment).toEqual(examination());
  });

  it.each(['input', 'change'])('trusted %s before startup permanently prevents hidden recovery', (type) => {
    const session = payload(); const env = environment({ patientId: null, session });
    env.fields.get('name').value = session.name;
    env.win.document.dispatchEvent({ type, isTrusted: true, target: env.fields.get('height') });
    expect(env.api.restoreMainSessionIfAny(options)).toBe(false);
    expect(env.state.restoreSessionIfUninitialized(session)).toBe(false);
    expect(env.api.collectUserData().user).not.toHaveProperty('pubertyAssessment');
  });

  it('synthetic restoration events do not consume the single startup recovery', () => {
    const session = payload(); const env = environment({ patientId: null, session });
    env.fields.get('name').value = session.name;
    env.win.document.dispatchEvent({ type: 'input', isTrusted: false });
    env.win.document.dispatchEvent({ type: 'change', isTrusted: false });
    expect(env.api.restoreMainSessionIfAny(options)).toBe(false);
    expect(env.api.collectUserData().user.pubertyAssessment).toEqual(examination());
  });

  it('a rejected startup attempt cannot be retried after the conflicting field is cleared', () => {
    const session = payload(); const env = environment({ patientId: null, session });
    env.fields.get('name').value = 'Fikcyjna Inna Osoba';
    expect(env.api.restoreMainSessionIfAny(options)).toBe(false);
    env.fields.get('name').value = session.name;
    expect(env.state.restoreSessionIfUninitialized(session)).toBe(false);
    expect(env.api.collectUserData().user).not.toHaveProperty('pubertyAssessment');
  });

  it('a changed same-tab session prevents recovery even when all basic fields still match', () => {
    const session = payload(); const env = environment({ patientId: null, session });
    env.fields.get('name').value = session.name;
    const changed = copy(session); changed.user.pubertyAssessment = { version: 9, differentContext: true };
    env.replaceSession(changed);
    expect(env.api.restoreMainSessionIfAny(options)).toBe(false);
    expect(env.state.restoreSessionIfUninitialized(session)).toBe(false);
    expect(env.api.collectUserData().user).not.toHaveProperty('pubertyAssessment');
  });

  it.each(['age', 'ageMonths', 'height', 'weight'])('a conflicting available %s rejects startup recovery without DOB', (key) => {
    const session = payload(); const env = environment({ patientId: null, session });
    env.fields.get(key).value = '99';
    expect(env.api.restoreMainSessionIfAny(options)).toBe(false);
    expect(env.api.collectUserData().user).not.toHaveProperty('pubertyAssessment');
  });

  it.each(['patient-event', 'stale-panel'])('%s before startup recovery invalidates its original context', (context) => {
    const session = payload(); const env = environment({ patientId: null, session });
    env.fields.get('name').value = session.name;
    if (context === 'patient-event') env.win.document.dispatchEvent({ type: 'vilda:patient-loaded', detail: { patientId: 'synthetic-b' } });
    else env.win.VildaPanelPacjent = { nieaktualny: () => true };
    expect(env.api.restoreMainSessionIfAny(options)).toBe(false);
    expect(env.api.collectUserData().user).not.toHaveProperty('pubertyAssessment');
  });

  it.each(['absent', 'cleared'])('cold guest hydration cannot override an explicitly %s carrier', (kind) => {
    const session = payload(); const env = environment({ patientId: null, session });
    env.fields.get('name').value = session.name;
    if (kind === 'cleared') env.state.clear();
    else env.state.load({ user: {} }, { restore: true });
    expect(env.api.restoreMainSessionIfAny(options)).toBe(false);
    expect(env.api.collectUserData().user).not.toHaveProperty('pubertyAssessment');
  });

  it('an absent assessment in the first recovered session prevents a later session from reviving it', () => {
    const session = payload(); delete session.user.pubertyAssessment;
    const env = environment({ patientId: null, session });
    env.fields.get('name').value = session.name;
    expect(env.api.restoreMainSessionIfAny(options)).toBe(false);
    expect(env.state.restoreSessionIfUninitialized(payload())).toBe(false);
    expect(env.api.collectUserData().user).not.toHaveProperty('pubertyAssessment');
  });

  it('the narrow anonymous hydration API cannot run in a patient-bound panel', () => {
    const env = environment(); env.fields.get('name').value = payload().name;
    expect(env.state.restoreSessionIfUninitialized(payload())).toBe(false);
    expect(env.api.collectUserData().user).not.toHaveProperty('pubertyAssessment');
  });

  it('real collect/save/restore retains independent stages, source and unknown dates in both panels', () => {
    const start = environment(); restore(start, payload());
    expect(start.api.saveMainSessionNow({ force: true })).toBe(true);
    const docpro = environment({ main: false });
    restore(docpro, start.session());
    expect(docpro.api.collectUserData().user.pubertyAssessment).toEqual(examination());
    expect(docpro.api.saveMainSessionNow({ force: true })).toBe(true);
    const reloaded = environment(); restore(reloaded, docpro.session());
    expect(reloaded.api.collectUserData().user.pubertyAssessment).toEqual(examination());
  });

  it.each(['empty', 'absent', 'future'])('DocPro recursive merge cannot resurrect or modify authoritative %s data', (type) => {
    const old = payload();
    const env = environment({ main: false, session: old });
    const current = payload(type === 'future' ? { version: 9, opaque: 7 } : { version: 1, sex: 'M', observations: { G: null, Th: null, P: null } });
    if (type === 'absent') delete current.user.pubertyAssessment;
    // Actual load establishes identity/save readiness; its synchronous session save
    // exercises the same merge used later by DocPro autosave.
    env.api.applyLoadedData(current, options);
    if (type === 'absent') expect(env.session().user).not.toHaveProperty('pubertyAssessment');
    else expect(env.session().user.pubertyAssessment).toEqual(current.user.pubertyAssessment);
  });

  it('the generic merger never receives either opaque assessment and the previous session remains intact', () => {
    const env = environment();
    const current = payload({ version: 9, extension: { preserve: [null, false] } });
    const previous = payload(); const originalPrevious = copy(previous);
    const originalRaw = copy(current.user.pubertyAssessment);
    let calls = 0;
    env.state.mergeSession(current, previous, (target, source) => {
      calls += 1;
      expect(target.user).not.toHaveProperty('pubertyAssessment');
      expect(source.user).not.toHaveProperty('pubertyAssessment');
      expect(source.user.height).toBe(previous.user.height);
      target.user.waist = 55;
    });
    expect(calls).toBe(1);
    expect(current.user.pubertyAssessment).toEqual(originalRaw);
    expect(current.user.waist).toBe(55);
    expect(previous).toEqual(originalPrevious);
  });

  it('an unrelated merge failure still restores the exact incoming opaque assessment', () => {
    const env = environment();
    const current = payload({ version: 9, extension: { preserve: [null, false] } });
    const original = copy(current);
    expect(() => env.state.mergeSession(current, payload(), (target, source) => {
      expect(target.user).not.toHaveProperty('pubertyAssessment');
      expect(source.user).not.toHaveProperty('pubertyAssessment');
      throw new Error('Fikcyjna awaria scalania innego pola');
    })).toThrow('Fikcyjna awaria scalania innego pola');
    expect(current).toEqual(original);
  });
});

describe('typed puberty — patient and vault boundaries', () => {
  it('anonymous import/session restore works while unrelated vault scripts are present but locked', () => {
    const env = environment({ patientId: null });
    env.win.VildaVault.isUnlocked = () => false;
    restore(env, payload());
    expect(env.api.collectUserData().user.pubertyAssessment).toEqual(examination());
    expect(env.api.saveMainSessionNow({ force: true })).toBe(true);
    expect(env.session().user.pubertyAssessment).toEqual(examination());
  });

  it('a stale panel cannot attach A assessment to B even before a load event arrives', () => {
    const env = environment(); restore(env, payload());
    env.win.sessionStorage.setItem('vildaCurrentPatientId', 'synthetic-b');
    expect(env.api.collectUserData().user).not.toHaveProperty('pubertyAssessment');
    env.win.sessionStorage.setItem('vildaCurrentPatientId', 'synthetic-a');
    expect(env.api.collectUserData().user).not.toHaveProperty('pubertyAssessment');
  });

  it('an imported JSON without a patient event cannot adopt a later unrelated patient', async () => {
    const env = environment({ patientId: null }); env.api.applyLoadedData(payload(), options);
    await Promise.resolve();
    env.win.sessionStorage.setItem('vildaCurrentPatientId', 'synthetic-b');
    env.win.document.dispatchEvent({ type: 'vilda:patient-loaded', detail: { patientId: 'synthetic-b', source: 'pick' } });
    expect(env.api.collectUserData().user).not.toHaveProperty('pubertyAssessment');
  });

  it('explicit load may finish assigning its new identity after applyLoadedData', () => {
    const env = environment(); env.api.applyLoadedData(payload(), options);
    env.win.sessionStorage.setItem('vildaCurrentPatientId', 'synthetic-b');
    env.win.document.dispatchEvent({ type: 'vilda:patient-loaded', detail: { patientId: 'synthetic-b', source: 'pick' } });
    expect(env.api.collectUserData().user.pubertyAssessment).toEqual(examination());
    expect(env.state.capture().patientId).toBe('synthetic-b');
  });

  it('a read between patient-loaded listeners cannot destroy the authorized same-event identity handoff', async () => {
    const env = environment(); env.api.applyLoadedData(payload(), options);
    const revision = env.state.getActivityRevision(); const reads = [];
    env.win.document.addEventListener('vilda:patient-loaded', () => reads.push(env.state.capture()));
    env.win.document.addEventListener('vilda:patient-loaded', () => env.win.sessionStorage.setItem('vildaCurrentPatientId', 'synthetic-b'));
    env.win.document.dispatchEvent({ type: 'vilda:patient-loaded', detail: { patientId: 'synthetic-b', source: 'pick' } });
    expect(reads[0].present, 'new payload is not exposed under the old identity').toBe(false);
    expect(env.api.collectUserData().user.pubertyAssessment).toEqual(examination());
    expect(env.state.capture().patientId).toBe('synthetic-b');
    await Promise.resolve();
    expect(env.state.capture().present).toBe(true);
    expect(env.state.getActivityRevision()).toBe(revision);
  });

  it('an unfinished identity handoff expires at the next microtask and cannot later revive the payload', async () => {
    const env = environment(); env.api.applyLoadedData(payload(), options);
    env.win.document.dispatchEvent({ type: 'vilda:patient-loaded', detail: { patientId: 'synthetic-b', source: 'pick' } });
    expect(env.state.capture().present).toBe(false);
    await Promise.resolve();
    env.win.sessionStorage.setItem('vildaCurrentPatientId', 'synthetic-b');
    expect(env.api.collectUserData().user).not.toHaveProperty('pubertyAssessment');
  });

  it('a third unrelated identity during the handoff still invalidates the carrier immediately', () => {
    const env = environment(); env.api.applyLoadedData(payload(), options);
    env.win.document.addEventListener('vilda:patient-loaded', () => {
      env.win.sessionStorage.setItem('vildaCurrentPatientId', 'synthetic-other');
      expect(env.state.capture().present).toBe(false);
      env.win.sessionStorage.setItem('vildaCurrentPatientId', 'synthetic-b');
    });
    env.win.document.dispatchEvent({ type: 'vilda:patient-loaded', detail: { patientId: 'synthetic-b', source: 'pick' } });
    expect(env.api.collectUserData().user).not.toHaveProperty('pubertyAssessment');
  });

  it('the real autocomplete loader completes applyLoadedData and its identity event in the handoff window', async () => {
    const env = environment();
    env.win.VildaVault.getPatient = async () => ({ snapshots: [{ payload: payload(), savedAtISO: '2025-02-03' }] });
    env.win.applyLoadedData = (value) => env.api.applyLoadedData(value, options);
    // The production identity listener in custom-fixes updates sessionStorage
    // when this event is dispatched; simulate that storage effect, not loading.
    const dispatch = env.win.document.dispatchEvent;
    env.win.document.dispatchEvent = (event) => {
      if (event.type === 'vilda:patient-loaded') env.win.sessionStorage.setItem('vildaCurrentPatientId', event.detail.patientId);
      return dispatch(event);
    };
    const auth = fs.readFileSync(new URL('../../vilda_auth_ui.js', import.meta.url), 'utf8');
    const source = auth.slice(auth.indexOf('function ks('), auth.indexOf('function Bz0(', auth.indexOf('function ks(')));
    const load = new Function('i', 'jt', 'bo', 'wo', `${source};return ks;`)(env.win, () => env.win.VildaVault, () => false, () => {});
    load('synthetic-b', 'Fikcyjny Test Pokwitania');
    await Promise.resolve(); await Promise.resolve();
    expect(env.state.capture().patientId).toBe('synthetic-b');
    expect(env.api.collectUserData().user.pubertyAssessment).toEqual(examination());
  });

  it('first save can assign the current unsigned draft an identity without losing the assessment', () => {
    const env = environment({ patientId: null }); restore(env, payload());
    env.win.__vildaOstatniWlasnyZapis = { patientId: 'synthetic-new', snapshotId: 'synthetic-snapshot' };
    env.win.sessionStorage.setItem('vildaCurrentPatientId', 'synthetic-new');
    env.win.document.dispatchEvent({ type: 'vilda:patient-loaded', detail: { patientId: 'synthetic-new', source: 'save' } });
    expect(env.api.collectUserData().user.pubertyAssessment).toEqual(examination());
  });

  it('identity event without a matching explicit load cannot adopt another patient', () => {
    const env = environment(); restore(env, payload());
    env.win.sessionStorage.setItem('vildaCurrentPatientId', 'synthetic-b');
    env.win.document.dispatchEvent({ type: 'vilda:patient-loaded', detail: { patientId: 'synthetic-b', source: 'pick' } });
    expect(env.api.collectUserData().user).not.toHaveProperty('pubertyAssessment');
  });

  it('lock, replaced vault, or stale shell ownership cannot expose the former carrier', () => {
    const locked = environment(); restore(locked, payload()); locked.lock();
    expect(locked.api.collectUserData().user).not.toHaveProperty('pubertyAssessment');
    const replaced = environment(); restore(replaced, payload());
    replaced.win.VildaVault = { isUnlocked: () => true };
    expect(replaced.api.collectUserData().user).not.toHaveProperty('pubertyAssessment');
    const stale = environment(); restore(stale, payload());
    stale.win.VildaPanelPacjent = { nieaktualny: () => true };
    expect(stale.api.collectUserData().user).not.toHaveProperty('pubertyAssessment');
  });
});

describe('typed puberty — conscious independent edits and visit intent', () => {
  it('editing P replaces only P and records the actual visit context', () => {
    const env = environment(); const original = payload(); original.user.measuredAtISO = '2025-02-03';
    original.user.pubertyAssessment.extra = { preserve: [null, false] };
    restore(env, original);
    expect(env.state.editObservation('P', 4)).toEqual({ ok: true });
    const result = env.api.collectUserData().user;
    expect(result.pubertyAssessment.observations.G).toEqual(original.user.pubertyAssessment.observations.G);
    // P-POKWITANIE-WIZYTA: the axis examined now carries the collected visit age (12 y 0 m) and its date.
    expect(result.pubertyAssessment.observations.P).toEqual({ stage: 4, sex: 'M', observedAtISO: result.measuredAtISO || null, ageMonths: 144, source: 'clinician-entry' });
    expect(result.pubertyAssessment.extra).toEqual(original.user.pubertyAssessment.extra);
    expect(result.pubertyAssessmentVisit.currentAxes).toEqual(['P']);
    expect(result.pubertyAssessmentVisit.visitId).toMatch(/^puberty-visit-/);
  });

  it('an explicitly dated observation with its own source keeps its values and is not re-anchored', () => {
    const env = environment(); restore(env, payload());
    expect(env.state.editObservation('P', 4, { observedAtISO: '2025-02-04', ageMonths: 144.5, source: 'external-dated' })).toEqual({ ok: true });
    env.fields.get('age').value = '13';
    env.win.document.dispatchEvent({ type: 'input', isTrusted: true, target: env.fields.get('age') });
    expect(env.api.collectUserData().user.pubertyAssessment.observations.P)
      .toEqual({ stage: 4, sex: 'M', observedAtISO: '2025-02-04', ageMonths: 144.5, source: 'external-dated' });
  });

  // P-POKWITANIE-WIZYTA (owner decision 2026-10-15): measured scenarios from the analysis.
  it('a stage chosen before the age is entered receives the visit age once it is known', () => {
    const env = environment({ patientId: null }); env.fields.get('sex').value = 'M';
    expect(env.state.editObservation('G', 3)).toEqual({ ok: true });
    let user = env.api.collectUserData().user;
    expect(user.pubertyAssessment.observations.G).toMatchObject({ stage: 3, ageMonths: null, observedAtISO: null });
    expect(user.pubertyAssessmentVisit.reference.ageMonths).toBeNull();
    env.fields.get('age').value = '12';
    env.win.document.dispatchEvent({ type: 'input', isTrusted: true, target: env.fields.get('age') });
    user = env.api.collectUserData().user;
    expect(user.pubertyAssessment.observations.G).toMatchObject({ stage: 3, ageMonths: 144 });
    expect(user.pubertyAssessmentVisit).toMatchObject({ currentAxes: ['G'], reference: { ageMonths: 144 } });
    expect(env.win.VildaPubertyAssessment.gonadalContext(user, { sex: 'M', currentAgeMonths: 144 }))
      .toMatchObject({ stage: 3, current: true, ageMonths: 144 });
  });

  it('blank years with the default zero months is an unknown visit age, not a newborn', () => {
    const env = environment({ patientId: null }); env.fields.get('sex').value = 'M';
    // The collector fills blank months with 0 (`ageMonths: h ?? 0`); the live form field is empty.
    env.fields.get('age').value = ''; env.fields.get('ageMonths').value = '';
    expect(env.state.visitContext().ageMonths).toBeNull();
    env.state.editObservation('G', 2);
    const user = env.api.collectUserData().user;
    expect(user.age).toBeNull(); expect(user.ageMonths).toBe(0);
    expect(user.pubertyAssessmentVisit.reference.ageMonths).toBeNull();
    expect(user.pubertyAssessment.observations.G.ageMonths).toBeNull();
    env.fields.get('age').value = '0'; env.fields.get('ageMonths').value = '6';
    expect(env.state.visitContext().ageMonths).toBe(6);
  });

  it('correcting the age after choosing a stage keeps that stage current in the same visit', () => {
    const env = environment({ patientId: null }); env.fields.get('sex').value = 'M'; env.fields.get('age').value = '12';
    env.state.editObservation('G', 3);
    for (const years of ['13', '14']) {
      env.fields.get('age').value = years;
      env.win.document.dispatchEvent({ type: 'input', isTrusted: true, target: env.fields.get('age') });
      const user = env.api.collectUserData().user;
      expect(user.pubertyAssessment.observations.G.ageMonths).toBe(Number(years) * 12);
      expect(env.win.VildaPubertyAssessment.gonadalContext(user, { sex: 'M', currentAgeMonths: Number(years) * 12 }))
        .toMatchObject({ stage: 3, current: true, reason: 'ready' });
    }
  });

  it('a historical axis outside the visit keeps its own age and date after an age correction', () => {
    const env = environment(); restore(env, payload());
    env.fields.get('age').value = '13';
    env.win.document.dispatchEvent({ type: 'input', isTrusted: true, target: env.fields.get('age') });
    expect(env.api.collectUserData().user.pubertyAssessment.observations.G).toEqual(examination().observations.G);
    env.state.editObservation('P', 3);
    const user = env.api.collectUserData().user;
    expect(user.pubertyAssessment.observations.G).toEqual(examination().observations.G);
    expect(user.pubertyAssessment.observations.P).toMatchObject({ stage: 3, ageMonths: 156 });
    expect(user.pubertyAssessmentVisit.currentAxes).toEqual(['P']);
  });

  it('unknown date remains unknown for a conscious entry with manual age', () => {
    const env = environment({ patientId: null });
    env.fields.get('sex').value = 'F'; env.fields.get('age').value = '11'; env.fields.get('ageMonths').value = '7';
    expect(env.state.editObservation('Th', 2)).toEqual({ ok: true });
    expect(env.state.read().assessment.observations.Th).toMatchObject({ stage: 2, observedAtISO: null, ageMonths: 139, source: 'clinician-entry' });
    expect(env.state.read().visit).toMatchObject({ currentAxes: ['Th'], ownerPatientId: null,
      reference: { sex: 'F', measuredAtISO: null, ageMonths: 139 } });
  });

  it('explicit clear preserves a typed empty slot and removes only its current membership', () => {
    const env = environment(); restore(env, payload());
    env.state.editObservation('G', 3); env.state.editObservation('P', 3);
    expect(env.state.editObservation('G', null)).toEqual({ ok: true });
    const current = env.state.read();
    expect(current.assessment.observations.G).toBeNull();
    expect(current.assessment.observations.P.stage).toBe(3);
    expect(current.visit.currentAxes).toEqual(['P']);
    expect(current.legacy).toBeNull();
  });

  it.each([['G', '3'], ['G', 0], ['G', 6], ['G', 2.5], ['G', true], ['B', 3]])('refuses invalid axis/stage %s %s', (axis, stage) => {
    const env = environment(); restore(env, payload()); const before = env.state.capture();
    expect(env.state.editObservation(axis, stage).ok).toBe(false);
    expect(env.state.capture()).toEqual(before);
  });

  it.each([{ version: 9, opaque: [null, false] }, { version: 1, sex: 'X', observations: {} }, null])('refuses overwriting unsupported or invalid raw %#', raw => {
    const env = environment(); restore(env, payload(raw));
    expect(env.state.editObservation('G', 3).ok).toBe(false);
    expect(env.api.collectUserData().user.pubertyAssessment).toEqual(raw);
  });

  it('source sex stays attached to every old axis when a different-sex observation is entered', () => {
    const env = environment(); restore(env, payload()); env.fields.get('sex').value = 'F';
    expect(env.state.editObservation('Th', 2)).toEqual({ ok: true });
    const raw = env.api.collectUserData().user.pubertyAssessment;
    expect(raw.sex).toBe('F');
    expect(raw.observations.G).toEqual({ ...examination().observations.G, sex: 'M' });
    expect(raw.observations.P).toEqual({ ...examination().observations.P, sex: 'M' });
    expect(raw.observations.Th).toMatchObject({ stage: 2, sex: 'F' });
    expect(env.state.read().visit.currentAxes).toEqual(['Th']);
    env.fields.get('sex').value = 'M'; env.state.editObservation('G', 4);
    const changedBack = env.api.collectUserData().user.pubertyAssessment;
    expect(changedBack.observations.Th.sex).toBe('F');
    expect(changedBack.observations.P.sex).toBe('M');
  });

  it.each(['input', 'change', 'collector-only'])('sex M→F→M through %s cannot renew a former current examination', type => {
    const env = environment(); restore(env, payload());
    env.state.editObservation('G', 3); env.state.editObservation('P', 2);
    const original = env.state.capture().raw;
    function changeSex(value) {
      env.fields.get('sex').value = value;
      if (type !== 'collector-only') env.win.document.dispatchEvent({ type, isTrusted: true, target: env.fields.get('sex') });
      return env.api.collectUserData();
    }
    changeSex('F'); const returned = changeSex('M');
    expect(returned.user.pubertyAssessment).toEqual(original);
    expect(env.state.read().visit.currentAxes).toEqual([]);
    const read = env.state.read();
    const clinical = env.win.VildaPubertyAssessment.gonadalContext(read, {
      sex: 'M', currentAgeMonths: 144, measuredAtISO: null,
      patientId: 'synthetic-a', visitMarker: read.visit,
    });
    expect(clinical.current).toBe(false);
    expect(clinical.stage).toBeNull();
    expect(env.state.editObservation('G', 3)).toEqual({ ok: true });
    expect(env.state.read().visit.currentAxes).toEqual(['G']);
  });

  it('synthetic replay alone does not change the saved visit membership', () => {
    const env = environment(); restore(env, payload()); env.state.editObservation('G', 3);
    const marker = env.state.read().visit;
    for (const value of ['F', 'M']) {
      env.fields.get('sex').value = value;
      env.win.document.dispatchEvent({ type: 'change', isTrusted: false, target: env.fields.get('sex') });
    }
    expect(env.state.read().visit).toEqual(marker);
  });

  it('same visit survives real collect/save/restore between Start, DocPro and F5', () => {
    const start = environment(); restore(start, payload()); start.state.editObservation('G', 3); start.state.editObservation('P', 2);
    start.api.saveMainSessionNow({ force: true });
    const saved = start.session(); const marker = saved.user.pubertyAssessmentVisit;
    const docpro = environment({ main: false }); restore(docpro, saved);
    expect(docpro.state.read().visit).toEqual(marker);
    docpro.api.saveMainSessionNow({ force: true });
    const reloaded = environment(); restore(reloaded, docpro.session());
    expect(reloaded.state.read().visit).toEqual(marker);
    expect(reloaded.state.read().visit.currentAxes).toEqual(['G', 'P']);
  });

  it('ordinary patient load starts another visit without changing historical observation JSON', () => {
    const env = environment(); restore(env, payload()); env.state.editObservation('G', 4);
    const previous = env.api.collectUserData(); const oldMarker = previous.user.pubertyAssessmentVisit;
    env.api.applyLoadedData(previous, options);
    expect(env.state.read().visit.visitId).not.toBe(oldMarker.visitId);
    expect(env.state.read().visit.currentAxes).toEqual([]);
    expect(env.api.collectUserData().user.pubertyAssessment).toEqual(previous.user.pubertyAssessment);
    env.api.saveMainSessionNow({ force: true });
    const reloaded = environment(); restore(reloaded, env.session());
    expect(reloaded.state.read().visit.currentAxes).toEqual([]);
  });

  it('editing current height or weight does not create another visit', () => {
    const env = environment(); restore(env, payload()); env.state.editObservation('G', 3);
    const marker = env.state.read().visit;
    env.fields.get('height').value = '150'; env.fields.get('weight').value = '40';
    env.win.document.dispatchEvent({ type: 'input', isTrusted: true, target: env.fields.get('height') });
    expect(env.state.read().visit).toEqual(marker);
    expect(env.state.read().visit.reference).not.toHaveProperty('height');
    expect(env.state.read().visit.reference).not.toHaveProperty('weight');
  });

  it.each(['owner', 'age', 'sex', 'date', 'id'])('restoration refuses a mismatched visit marker: %s', key => {
    const first = environment(); restore(first, payload()); first.state.editObservation('G', 3);
    const data = first.api.collectUserData(); const marker = data.user.pubertyAssessmentVisit;
    if (key === 'owner') marker.ownerPatientId = 'synthetic-other';
    if (key === 'age') marker.reference.ageMonths = 999;
    if (key === 'sex') marker.reference.sex = 'F';
    if (key === 'date') marker.reference.measuredAtISO = '2020-01-01';
    if (key === 'id') marker.visitId = '';
    const env = environment(); restore(env, data);
    expect(env.state.read().visit).toBeNull();
    expect(env.api.collectUserData().user.pubertyAssessment).toEqual(data.user.pubertyAssessment);
  });

  it('legacy read remains unspecified and a new edit never copies its number into another axis', () => {
    const env = environment(); const old = payload(); delete old.user.pubertyAssessment; restore(env, old);
    expect(env.state.read().legacy).toEqual({ kind: 'unspecified', stage: 4 });
    env.state.editObservation('P', 2);
    expect(env.state.read().assessment.observations.G).toBeNull();
    expect(env.state.read().legacy).toBeNull();
  });

  it('assessment alone is meaningful session data, including deliberate empty and future raw', () => {
    const env = environment({ patientId: null }); env.fields.get('sex').value = 'M';
    env.state.editObservation('G', 3);
    expect(env.api.saveMainSessionNow({ force: true })).toBe(true);
    expect(env.session().user.pubertyAssessment.observations.G.stage).toBe(3);
    env.state.editObservation('G', null);
    expect(env.api.saveMainSessionNow({ force: true })).toBe(true);
    expect(env.session().user.pubertyAssessment.observations.G).toBeNull();
    expect(env.api.hasMeaningfulMainSessionData({ version: 1, user: { pubertyAssessment: { version: 9 } } })).toBe(true);
    expect(env.api.anyDataEntered()).toBe(true);
  });

  it('a second axis remains in the same visit after the collector normalizes empty age fields', () => {
    const env = environment({ patientId: null }); env.fields.get('sex').value = 'M';
    env.state.editObservation('G', 2);
    const id = env.state.read().visit.visitId;
    env.api.saveMainSessionNow({ force: true });
    env.state.editObservation('P', 3);
    expect(env.state.read().visit.visitId).toBe(id);
    expect(env.state.read().visit.currentAxes).toEqual(['G', 'P']);
    expect(env.api.collectUserData().user.pubertyAssessment.observations.G.ageMonths).toBeNull();
  });

  it('notifies active consumers about load/edit/clear without synthetic DOM edits', () => {
    const env = environment(); const direct = []; const events = [];
    const stop = env.state.subscribe(reason => direct.push(reason));
    env.win.document.addEventListener('vilda:puberty-assessment-changed', event => events.push(event.detail.reason));
    restore(env, payload()); env.state.editObservation('G', 4); env.state.clear(); stop(); env.state.clear();
    expect(direct).toContain('load'); expect(direct).toContain('edit'); expect(direct).toContain('clear');
    expect(events).toContain('edit'); expect(events.at(-1)).toBe('clear');
    expect(direct.length).toBe(events.length - 1);
  });

  it('atomic session merge excludes the visit marker and never resurrects a previous membership', () => {
    const env = environment(); const current = payload(); const previous = payload();
    previous.user.pubertyAssessmentVisit = { version: 9, opaque: { preserve: true } };
    env.state.mergeSession(current, previous, (target, source) => {
      expect(target.user).not.toHaveProperty('pubertyAssessmentVisit');
      expect(source.user).not.toHaveProperty('pubertyAssessmentVisit');
    });
    expect(current.user).not.toHaveProperty('pubertyAssessmentVisit');
    current.user.pubertyAssessmentVisit = { version: 9, opaque: null };
    env.state.mergeSession(current, previous, () => {});
    expect(current.user.pubertyAssessmentVisit).toEqual({ version: 9, opaque: null });
    expect(previous.user.pubertyAssessmentVisit.opaque.preserve).toBe(true);
  });
});

describe('typed puberty — edits during the restore pause use the real session collector', () => {
  it('retains an edit immediately for forced save and then saves without another interaction after the pause', async () => {
    vi.useFakeTimers();
    const env = environment({ timers: true }); restore(env, payload()); env.api.saveMainSessionNow({ force: true });
    env.win.__vildaPersistPauseUntil = Date.now() + 900;
    env.state.editObservation('G', 4);
    await vi.advanceTimersByTimeAsync(400);
    expect(env.session().user.pubertyAssessment.observations.G.stage).toBe(3);
    expect(env.api.collectUserData().user.pubertyAssessment.observations.G.stage).toBe(4);
    expect(env.api.saveMainSessionNow({ force: true })).toBe(true);
    expect(env.session().user.pubertyAssessment.observations.G.stage).toBe(4);
    env.state.editObservation('G', 5);
    await vi.advanceTimersByTimeAsync(600);
    expect(env.session().user.pubertyAssessment.observations.G.stage).toBe(5);
  });

  it.each(['clear', 'load', 'patient-change', 'lock'])('%s invalidates the queued edit before it can overwrite another visit', async boundary => {
    vi.useFakeTimers();
    const env = environment({ timers: true }); restore(env, payload()); env.api.saveMainSessionNow({ force: true });
    env.win.__vildaPersistPauseUntil = Date.now() + 900; env.state.editObservation('G', 4);
    const replacement = payload(); replacement.user.pubertyAssessment.observations.G.stage = 2;
    env.replaceSession(replacement);
    if (boundary === 'clear') env.state.clear();
    if (boundary === 'load') env.state.load(replacement, { restore: true });
    if (boundary === 'patient-change') env.win.sessionStorage.setItem('vildaCurrentPatientId', 'synthetic-b');
    if (boundary === 'lock') env.lock();
    await vi.advanceTimersByTimeAsync(1000);
    expect(env.session().user.pubertyAssessment.observations.G.stage).toBe(2);
  });

  it.each(['restoring', 'mirror', 'clear', 'stale-panel', 'locked'])('%s refuses a clinical edit rather than accepting a restore echo', guard => {
    const env = environment(); restore(env, payload());
    if (guard === 'restoring') env.win.__vildaPersistRestoring = true;
    if (guard === 'mirror') env.win.__vildaLustroWpis = true;
    if (guard === 'clear') env.win.__vildaPersistClearUntil = Date.now() + 900;
    if (guard === 'stale-panel') env.win.VildaPanelPacjent = { nieaktualny: () => true };
    if (guard === 'locked') env.win.VildaVault.isUnlocked = () => false;
    expect(env.state.editObservation('G', 4)).toEqual({ ok: false, reason: 'blocked' });
  });
});

describe('typed puberty — in-memory activity priority across same-tab forms', () => {
  it('orders load, conscious edit, restore and clear across Start and DocPro even in one clock tick', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-15T12:00:00Z'));
    const sharedTop = { document: {} };
    const start = environment({ sharedTop }); const docpro = environment({ main: false, sharedTop });
    restore(docpro, payload()); const oldDocpro = docpro.state.getActivityRevision();
    restore(start, payload()); const loaded = start.state.getActivityRevision();
    expect(loaded).toBeGreaterThan(oldDocpro);
    start.state.editObservation('G', 2); const edited = start.state.getActivityRevision();
    expect(edited).toBeGreaterThan(loaded);
    expect(docpro.state.getActivityRevision()).toBe(oldDocpro);
    start.state.load(payload(), { restore: true }); const restored = start.state.getActivityRevision();
    expect(restored).toBeGreaterThan(edited);
    start.state.clear();
    expect(start.state.getActivityRevision()).toBeGreaterThan(restored);
    expect(start.state.capture().activityRevision).toBe(start.state.getActivityRevision());
    expect(sharedTop.__vildaPubertyAssessmentRevision).toBe(start.state.getActivityRevision());
  });

  it('read, capture, collector and save do not increase activity priority', () => {
    const env = environment(); restore(env, payload()); env.state.editObservation('G', 3);
    const revision = env.state.getActivityRevision();
    for (let i = 0; i < 3; i += 1) {
      env.state.read(); env.state.capture(); env.api.collectUserData(); env.api.saveMainSessionNow({ force: true });
    }
    expect(env.state.getActivityRevision()).toBe(revision);
    expect(env.win.__vildaPubertyAssessmentRevision).toBe(revision);
    expect(env.api.collectUserData().user).not.toHaveProperty('activityRevision');
    expect(env.api.collectUserData().user.pubertyAssessmentVisit).not.toHaveProperty('activityRevision');
  });

  it.each(['age', 'ageMonths', 'dobInput', 'sex'])('trusted %s intent raises source priority and re-anchors only the axis examined in this visit', field => {
    const env = environment(); restore(env, payload()); env.state.editObservation('G', 3);
    const original = env.state.capture().raw; const before = env.state.getActivityRevision();
    const input = env.fields.get(field);
    input.value = { age: '13', ageMonths: '1', dobInput: '01-01-2014', sex: 'F' }[field];
    env.win.document.dispatchEvent({ type: 'input', isTrusted: true, target: input });
    expect(env.state.getActivityRevision()).toBeGreaterThan(before);
    // P-POKWITANIE-WIZYTA: the current G follows the corrected visit; a sex change revokes membership instead.
    const expected = copy(original);
    if (field !== 'sex') {
      expected.observations.G.ageMonths = env.state.visitContext().ageMonths;
      expected.observations.G.observedAtISO = env.state.visitContext().measuredAtISO;
    }
    expect(env.state.capture().raw).toEqual(expected);
    expect(env.state.capture().raw.observations.P).toEqual(original.observations.P);
    expect(env.state.read().visit.currentAxes).toEqual(field === 'sex' ? [] : ['G']);
    const after = env.state.getActivityRevision(); env.api.collectUserData();
    expect(env.state.getActivityRevision()).toBe(after);
  });

  it('synthetic demographic restoration does not take source priority from another active form', () => {
    const env = environment(); restore(env, payload()); env.state.editObservation('G', 3);
    const before = env.state.getActivityRevision();
    for (const field of ['age', 'ageMonths', 'dobInput', 'sex']) {
      env.win.document.dispatchEvent({ type: 'change', isTrusted: false, target: env.fields.get(field) });
    }
    expect(env.state.getActivityRevision()).toBe(before);
  });

  it('does not repeat clinical notifications for unchanged restore echoes, but publishes a changed derived age', () => {
    const env = environment(); restore(env, payload());
    const changed = vi.fn(); env.state.subscribe(changed);
    const before = env.state.getActivityRevision();
    for (let pass = 0; pass < 2; pass += 1) {
      for (const id of ['age', 'ageMonths', 'height', 'weight', 'sex']) {
        for (const type of ['input', 'change']) {
          env.win.document.dispatchEvent({ type, isTrusted: false, target: env.fields.get(id) });
        }
      }
    }
    expect(changed).not.toHaveBeenCalled();
    env.fields.get('ageMonths').value = '1';
    env.win.document.dispatchEvent({ type: 'input', isTrusted: false, target: env.fields.get('ageMonths') });
    env.win.document.dispatchEvent({ type: 'change', isTrusted: false, target: env.fields.get('ageMonths') });
    expect(changed.mock.calls).toEqual([['visit-change']]);
    expect(env.state.visitContext().ageMonths).toBe(145);
    expect(env.state.getActivityRevision()).toBe(before);
    env.win.document.dispatchEvent({ type: 'change', isTrusted: true, target: env.fields.get('ageMonths') });
    expect(changed.mock.calls).toEqual([['visit-change'], ['visit-change']]);
    expect(env.state.getActivityRevision()).toBeGreaterThan(before);
  });

  it('publishes a changed examination date even when visible field values have not changed', () => {
    const env = environment(); let date = '2026-10-14';
    env.win.VildaDobAge.readMeasuredAtISO = () => date;
    restore(env, payload());
    const original = env.state.capture().raw;
    const changed = vi.fn(); env.state.subscribe(changed);
    date = '2026-10-15';
    for (const type of ['input', 'change']) {
      env.win.document.dispatchEvent({ type, isTrusted: false, target: env.fields.get('age') });
    }
    expect(changed.mock.calls).toEqual([['visit-change']]);
    expect(env.state.visitContext().measuredAtISO).toBe('2026-10-15');
    expect(env.state.capture().raw).toEqual(original);
  });

  it.each(['height', 'weight', 'ageWeeks', 'advTesticularVolume', 'advFamilyDelayedPuberty', 'advGrowthExclusion',
    'pubertyOnsetAge', 'pubertyMenarcheAge', 'pubertyMenarcheHeight', 'pubertyMenarcheBoneAge',
    'pubertyGnrhaStatus', 'pubertyGnrhaStartAge', 'pubertyGnrhaStopAge', 'pubertyCdgp'])('trusted %s fact selects the edited form without renewing its Tanner observation', id => {
    const env = environment(); restore(env, payload()); env.state.editObservation('G', 3);
    const original = env.state.capture().raw; const before = env.state.getActivityRevision();
    env.win.document.dispatchEvent({ type: 'change', isTrusted: true, target: { id, value: 'synthetic-value' } });
    expect(env.state.getActivityRevision()).toBeGreaterThan(before);
    expect(env.state.capture().raw).toEqual(original);
    expect(env.state.read().visit.currentAxes).toEqual(['G']);
    const current = env.state.getActivityRevision();
    env.win.document.dispatchEvent({ type: 'change', isTrusted: false, target: { id } });
    expect(env.state.getActivityRevision()).toBe(current);
  });

  it.each(['theme', 'password', 'email', 'loginName'])('unrelated %s controls do not take clinical form priority', id => {
    const env = environment(); restore(env, payload()); const before = env.state.getActivityRevision();
    env.win.document.dispatchEvent({ type: 'input', isTrusted: true, target: { id } });
    expect(env.state.getActivityRevision()).toBe(before);
  });

  it('passive invalidation during read does not turn an old panel into the newest clinical action', () => {
    const env = environment(); restore(env, payload());
    const revision = env.state.getActivityRevision();
    env.win.sessionStorage.setItem('vildaCurrentPatientId', 'synthetic-other');
    expect(env.state.capture().present).toBe(false);
    expect(env.state.getActivityRevision()).toBe(revision);
    expect(env.api.collectUserData().user).not.toHaveProperty('pubertyAssessment');
    expect(env.state.getActivityRevision()).toBe(revision);
  });

  it('uses a local monotonic counter when top is inaccessible and survives a clock moving backwards', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-15T12:00:00Z'));
    const blockedTop = {}; Object.defineProperty(blockedTop, 'document', { get() { throw new Error('Fikcyjna obca domena'); } });
    const env = environment({ sharedTop: blockedTop }); restore(env, payload());
    const initial = env.state.getActivityRevision();
    vi.setSystemTime(new Date('2025-10-15T12:00:00Z')); env.state.editObservation('G', 2);
    expect(env.state.getActivityRevision()).toBeGreaterThan(initial);
    expect(env.win.__vildaPubertyAssessmentRevision).toBe(env.state.getActivityRevision());
    expect(blockedTop).not.toHaveProperty('__vildaPubertyAssessmentRevision');
  });
});
