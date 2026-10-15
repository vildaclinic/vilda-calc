import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

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
function environment({ main = true, session = null, patientId = 'synthetic-a' } = {}) {
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
    setTimeout: () => 0, clearTimeout() {}, confirm: () => true,
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
  win.window = win; win.self = win; win.parent = win; win.top = win;
  if (patientId) win.sessionStorage.setItem('vildaCurrentPatientId', patientId);
  for (const file of ['vilda_dob_age.js', 'vilda_puberty_assessment.js', 'vilda_puberty_assessment_state.js', 'vilda_data_import_export.js']) {
    const source = fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    new Function('window', 'globalThis', 'document', 'setTimeout', 'clearTimeout', source)(win, win, doc, win.setTimeout, win.clearTimeout);
  }
  return { win, fields, api: win.VildaDataImportExport, state: win.VildaPubertyAssessmentState,
    session: () => savedSession && copy(savedSession),
    replaceSession: (value) => { savedSession = copy(value); },
    lock: () => { unlocked = false; lockCallbacks.forEach((fn) => fn()); },
  };
}
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
