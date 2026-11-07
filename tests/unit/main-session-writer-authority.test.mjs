import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { powloka } from '../support/powloka-harness.mjs';

// The real shell, panel ownership protocol, adapter and main-session writer.
// Only the browser DOM, scheduling and the collector's clinical payload are
// controlled. No patient data or persistence decisions are fabricated.
const source = file => fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const PID = 'fictional-writer-same-patient';
const OLD = { version: 1, clcr: null, name: 'Fikcyjny Pacjent Autorytetu Sesji',
  user: { age: 13, ageMonths: 0, sex: 'M', height: 158, weight: 46,
    dobISO: '2013-07-06', measuredAtISO: '2026-07-06' },
  advanced: { data: { measurements: [{ ageMonths: 144, height: 151, weight: 41 }] } },
  intake: { history: [{ ageMonths: 144, height: 151, weight: 41 }], pal: '1.8' },
  birth: { weeks: '35', days: '2', assessment: { fictionalImmutableResult: 'SGA-synthetic' } },
};
const CURRENT = { ...clone(OLD),
  user: { ...OLD.user, ageMonths: 4, height: null, weight: null, measuredAtISO: '2026-11-06' },
  advanced: { data: { measurements: [...OLD.advanced.data.measurements, { ageMonths: 156, height: 158, weight: 46 }] } },
  intake: { history: [...OLD.intake.history, { ageMonths: 156, height: 158, weight: 46 }], pal: '1.8' },
};

function storage() {
  const values = new Map(), mainWrites = [];
  return { mainWrites, getItem: key => values.get(key) ?? null,
    setItem(key, value) { values.set(key, String(value)); if (key === 'vildaMainSessionV1') mainWrites.push(JSON.parse(value)); }, removeItem: key => values.delete(key),
    key: index => [...values.keys()][index] ?? null, get length() { return values.size; } };
}

function clinical(frame, session, local, initial, route) {
  const win = frame.contentWindow, document = frame.contentDocument;
  document.defaultView = win;
  let record = clone(initial), sessionToken = {}, account = 'fictional-writer-account', unlocked = true;
  const vault = { isUnlocked: () => unlocked, getCurrentUser: () => ({ userId: account }),
    captureSyncOperationSession() { if (!unlocked) throw new Error('fictional locked vault'); return sessionToken; },
    assertSyncOperationSession(token) { if (!unlocked || token !== sessionToken) throw new Error('fictional stale vault session'); },
  };
  const fields = new Map(Object.entries({ name: record.name, age: '13', ageMonths: String(record.user.ageMonths),
    sex: 'M', height: record.user.height ?? '', weight: record.user.weight ?? '', intakePal: '1.8' })
    .map(([id, value]) => [id, { id, value: String(value), tagName: 'INPUT', type: 'text',
      style: {}, dataset: {}, disabled: false, closest: () => null, matches: () => true,
      addEventListener() {}, dispatchEvent() { return true; }, setAttribute() {}, removeAttribute() {} }]));
  document.getElementById = id => fields.get(id) || null;
  document.getElementsByName = () => [];
  document.removeEventListener ||= () => {};
  win.removeEventListener ||= () => {};
  Object.assign(win, { sessionStorage: session, localStorage: local, lastLoadedData: clone(initial),
    frameElement: frame, setTimeout, clearTimeout, vildaAppOnReady() {},
    Event: class { constructor(type) { this.type = type; } },
    VildaVault: vault, VildaAuthUI: { isBootReady: () => true },
    location: { pathname: route === 'start' ? '/index.html' : '/docpro.html', reload: vi.fn() } });
  win.window = win; win.self = win; win.top = win.parent;
  delete win.applyLoadedData;
  for (const file of ['vilda_panel_pacjent.js', 'vilda_persistence_adapter.js', 'vilda_data_import_export.js']) {
    new Function('window', 'globalThis', 'document', 'setTimeout', 'clearTimeout', 'Event', 'CustomEvent', source(file))(
      win, win, document, setTimeout, clearTimeout, win.Event, win.CustomEvent);
  }
  const api = win.VildaDataImportExport;
  const options = { collectUserData: () => clone(record), syncSharedUserDataFromLoadedData() {} };
  api.restoreMainSessionIfAny();
  api.initMainSessionPersistence(options);
  return { win, frame, fields, api, options,
    rotateSession() { sessionToken = {}; },
    switchAccount() { account = 'fictional-writer-next-account'; sessionToken = {}; },
    lock() { unlocked = false; sessionToken = {}; },
    set(value) { record = clone(value); },
    save(extra = {}) { return api.saveMainSessionNow({ ...options, ...extra }); },
    schedule() { return api.scheduleMainSessionSave({ target: fields.get('weight') }, options); },
    hiddenEvent() {
      document.hidden = true; document.visibilityState = 'hidden';
      document.dispatchEvent({ type: 'visibilitychange' });
    },
  };
}

function harness({ patientId = PID } = {}) {
  const session = storage(), local = storage();
  if (patientId) session.setItem('vildaCurrentPatientId', patientId);
  const p = powloka(null, host => { host.sessionStorage = session; host.localStorage = local; });
  const oldFrame = p.ramki.get(p.shell.routes.docpro.src.split('?')[0]);
  p.shell.navigate('start');
  const currentFrame = p.ramki.get(p.shell.routes.start.src.split('?')[0]);
  const old = clinical(oldFrame, session, local, OLD, 'docpro');
  const current = clinical(currentFrame, session, local, CURRENT, 'start');
  // Each document has finished its own no-session startup. The current frame
  // now carries the new visit of the same patient; the other remains old.
  expect(current.save({ force: true })).toBe(true);
  const reference = JSON.stringify({ patientId, snapshotId: 'fictional-saved-old-visit', fp: 'committed-reference' });
  session.setItem('vilda-save-ref-v1', reference);
  const writes = session.mainWrites; writes.length = 0;
  return { ...p, session, old, current, writes,
    main: () => current.win.VildaPersistence.readMainSession(),
    assertReference() { expect(session.getItem('vilda-save-ref-v1')).toBe(reference); },
  };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-06T12:00:00Z')); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('only the current clinical document can publish the shared main session', () => {
  it('keeps the actual new document writer through its first iframe load', async () => {
    const h = harness(), ticket = h.current.win.VildaPanelPacjent.captureWriteAuthority();
    const document = h.current.frame.contentDocument;
    expect(h.current.win.VildaPanelPacjent.isWriteAuthorityCurrent(ticket)).toBe(true);
    expect(h.current.schedule()).toBe(true);
    h.load('start');
    expect(h.current.frame.contentDocument).toBe(document);
    expect(h.current.win.VildaPanelPacjent.isWriteAuthorityCurrent(ticket)).toBe(true);
    await vi.advanceTimersByTimeAsync(300);
    expect(h.writes).toHaveLength(1); expect(h.main()).toEqual(CURRENT); h.assertReference();
  });

  it('a real reload fences the old document and confirms only its replacement first load', () => {
    const h = harness(), oldDocument = h.current.frame.contentDocument;
    const oldTicket = h.shell.captureSessionWriter(h.current.win);
    h.shell.reload('start');
    expect(h.shell.isSessionWriterCurrent(oldTicket, h.current.win)).toBe(false);
    expect(h.shell.captureSessionWriter(h.current.win)).toBeNull();
    const nextDocument = Object.assign({}, oldDocument);
    h.current.frame.contentDocument = nextDocument; h.current.win.document = nextDocument;
    const nextTicket = h.shell.captureSessionWriter(h.current.win);
    expect(nextTicket).not.toBeNull(); h.load('start');
    expect(h.shell.isSessionWriterCurrent(nextTicket, h.current.win)).toBe(true);
    expect(h.shell.isSessionWriterCurrent(oldTicket, h.current.win)).toBe(false);
    h.load('start');
    expect(h.shell.isSessionWriterCurrent(nextTicket, h.current.win)).toBe(false);
  });

  it.each(['document', 'about:blank', 'route', 'account', 'key', 'visit'])('initial load cannot continue a writer after %s changes', async cause => {
    const h = harness(), ticket = h.current.win.VildaPanelPacjent.captureWriteAuthority();
    h.current.schedule();
    if (cause === 'document') { const next = Object.assign({}, h.current.frame.contentDocument); h.current.frame.contentDocument = next; h.current.win.document = next; }
    if (cause === 'about:blank') h.current.win.location.pathname = 'blank';
    if (cause === 'route') { h.shell.navigate('docpro'); h.shell.navigate('start'); }
    if (cause === 'account') h.current.switchAccount();
    if (cause === 'key') h.current.rotateSession();
    if (cause === 'visit') h.current.win.VildaPanelPacjent.invalidateWriteAuthority();
    const writesBeforeLoad = clone(h.writes); // Navigation may legitimately flush its active document.
    h.load('start');
    expect(h.current.win.VildaPanelPacjent.isWriteAuthorityCurrent(ticket)).toBe(false);
    await vi.advanceTimersByTimeAsync(300);
    expect(h.writes).toEqual(writesBeforeLoad); h.assertReference();
  });

  it.each([false, true])('same patient does not authorize an old hidden visit, force=%s', force => {
    const h = harness(), before = h.main();
    expect(h.shell.getCurrentRoute()).toBe('start');
    expect(h.old.frame.hidden).toBe(true);
    expect(h.old.win.VildaPanelPacjent.nieaktualny()).toBe(false);
    expect(h.old.win.VildaPanelPacjent.wlasciciel()).toBe(PID);
    expect(h.old.save({ force })).toBe(false);
    expect(h.writes).toEqual([]);
    expect(h.main()).toEqual(before);
    expect(h.main().user).toMatchObject({ ageMonths: 4, measuredAtISO: '2026-11-06' });
    expect(h.main().advanced.data.measurements).toEqual(CURRENT.advanced.data.measurements);
    h.assertReference();
  });

  it('a synthetic delayed input in the hidden same-patient panel cannot schedule a stale write', () => {
    const h = harness(), before = h.main();
    expect(h.old.schedule()).toBe(false);
    vi.advanceTimersByTime(400);
    expect(h.writes).toEqual([]);
    expect(h.main()).toEqual(before); h.assertReference();
  });

  it.each(['visibilitychange', 'pagehide'])('%s from a hidden same-patient pane leaves the entire current visit intact', event => {
    const h = harness(), before = h.main();
    if (event === 'visibilitychange') h.old.hiddenEvent();
    else h.old.win.dispatchEvent({ type: 'pagehide' });
    expect(h.writes).toEqual([]);
    expect(h.main()).toEqual(before); h.assertReference();
  });

  it('the active frame still writes genuine new visit edits and explicit empty history', () => {
    const h = harness();
    const edited = clone(CURRENT);
    edited.user.height = 160; edited.user.weight = 48;
    edited.advanced.data.measurements = []; edited.intake.history = [];
    h.current.set(edited);
    expect(h.current.save()).toBe(true);
    expect(h.main()).toEqual(edited);
    expect(h.writes).toEqual([edited]); h.assertReference();
  });

  it('hiding the browser tab does not revoke its active clinical frame', () => {
    const h = harness(), edited = clone(CURRENT);
    edited.user.weight = 48; h.current.set(edited);
    h.doc.hidden = true;
    h.current.hiddenEvent();
    expect(h.current.frame.hidden).toBe(false);
    expect(h.main()).toEqual(edited);
    expect(h.writes).toEqual([edited]); h.assertReference();
  });

  it('navigation flushes the outgoing current edit synchronously before giving up ownership', () => {
    const h = harness(), edited = clone(CURRENT);
    edited.user.height = 160; edited.user.weight = 48; h.current.set(edited);
    expect(h.current.schedule()).toBe(true);
    h.shell.navigate('docpro');
    expect(h.main()).toEqual(edited);
    expect(h.writes[0]).toEqual(edited);
    const afterHandoff = h.main(); h.current.set(clone(OLD));
    vi.advanceTimersByTime(400);
    expect(h.main()).toEqual(afterHandoff);
    h.assertReference();
  });

  it('a newer same-patient application during collection wins over the earlier save attempt', () => {
    const h = harness(), newer = clone(CURRENT);
    newer.user.weight = 49; newer.user.height = 161;
    expect(h.current.api.saveMainSessionNow({ ...h.current.options, force: true,
      collectUserData() {
        h.current.set(newer);
        expect(h.current.api.applyLoadedData(newer, h.current.options)).toBe(true);
        return clone(OLD);
      },
    })).toBe(false);
    expect(h.main()).toEqual(newer);
    expect(h.writes).toEqual([newer]); h.assertReference();
  });

  it.each(['session', 'account', 'lock'])('a queued draft write does not outlive its %s scope', action => {
    const h = harness(), before = h.main();
    expect(h.current.schedule()).toBe(true);
    if (action === 'session') h.current.rotateSession();
    if (action === 'account') h.current.switchAccount();
    if (action === 'lock') h.current.lock();
    h.current.set(clone(OLD));
    vi.advanceTimersByTime(400);
    expect(h.writes).toEqual([]);
    expect(h.main()).toEqual(before); h.assertReference();
  });

  it.each([
    ['main', p => p.writeMainSession(clone(OLD))],
    ['shared forced', p => p.writeShared({ name: OLD.name, weight: 46 }, { force: true })],
    ['renal', p => p.writeClcrSession({ inputs: { Scr: '0.8' } })],
    ['steroid', p => p.writeSteroidSession({ synthetic: 'stale-form' })],
    ['DocPro forced', p => p.writeDocproUi({ version: 2, fictional: 'old' }, { force: true })],
    ['therapy', p => p.writeModuleJSON('GH_THERAPY_POINTS', [{ ageMonths: 156, height: 158 }], { force: true })],
  ])('the adapter rejects a hidden same-patient %s writer before touching storage', (_label, write) => {
    const h = harness();
    const snapshot = () => Array.from({ length: h.session.length }, (_, i) => h.session.key(i))
      .sort().map(key => [key, h.session.getItem(key)]);
    const before = snapshot();
    expect(write(h.old.win.VildaPersistence)).toBe(false);
    expect(snapshot()).toEqual(before); h.assertReference();
  });

  it('returning to the same active frame cannot revive its old activation ticket', () => {
    const h = harness(), panel = h.current.win.VildaPanelPacjent;
    const ticket = panel.captureWriteAuthority();
    expect(panel.isWriteAuthorityCurrent(ticket)).toBe(true);
    expect(h.old.win.VildaPanelPacjent.captureWriteAuthority()).toBeNull();
    h.shell.navigate('docpro');
    expect(panel.isWriteAuthorityCurrent(ticket)).toBe(false);
    h.shell.navigate('start');
    expect(panel.isWriteAuthorityCurrent(ticket)).toBe(false);
    expect(panel.isWriteAuthorityCurrent(panel.captureWriteAuthority())).toBe(true);
  });

  it.each(['apply', 'clear', 'session', 'account', 'lock'])('%s invalidates an earlier ticket of the active same-patient frame', action => {
    const h = harness(), panel = h.current.win.VildaPanelPacjent;
    const ticket = panel.captureWriteAuthority();
    expect(panel.isWriteAuthorityCurrent(ticket)).toBe(true);
    if (action === 'apply') {
      const newer = clone(CURRENT); newer.user.weight = 49; h.current.set(newer);
      expect(h.current.api.applyLoadedData(newer, h.current.options)).toBe(true);
    }
    if (action === 'clear') h.current.win.document.dispatchEvent({ type: 'vilda:user-state-cleared' });
    if (action === 'session') h.current.rotateSession();
    if (action === 'account') h.current.switchAccount();
    if (action === 'lock') h.current.lock();
    expect(panel.isWriteAuthorityCurrent(ticket)).toBe(false);
    h.assertReference();
  });

  it.each([null, PID])('own-save PID assignment preserves the current visit ticket and queued edit from %s', patientId => {
    const h = harness({ patientId }), panel = h.current.win.VildaPanelPacjent;
    const ticket = panel.captureWriteAuthority(), edited = clone(CURRENT);
    edited.user.weight = 48; h.current.set(edited);
    expect(h.current.schedule()).toBe(true);
    h.session.setItem('vildaCurrentPatientId', PID);
    h.current.win.document.dispatchEvent({ type: 'vilda:patient-loaded', detail: { source: 'save', patientId: PID } });
    expect(panel.wlasciciel()).toBe(PID);
    expect(panel.isWriteAuthorityCurrent(ticket)).toBe(true);
    vi.advanceTimersByTime(400);
    expect(h.writes).toEqual([edited]);
    expect(h.main()).toEqual(edited); h.assertReference();
  });

  it('native Restore invalidates queued producers even when its apply sequence and patient ID are unchanged', () => {
    const h = harness(), panel = h.current.win.VildaPanelPacjent;
    const ticket = panel.captureWriteAuthority(), sequence = h.current.api.getApplyLoadedDataSequence();
    h.current.api.restoreLoadedState({ ...h.current.options, data: clone(CURRENT), anyDataEntered: () => false });
    expect(h.current.api.getApplyLoadedDataSequence()).toBe(sequence);
    expect(panel.wlasciciel()).toBe(PID);
    expect(panel.isWriteAuthorityCurrent(ticket)).toBe(false); h.assertReference();
  });

  it('cancelling native Restore preserves the current visit ticket and entire draft', () => {
    const h = harness(), panel = h.current.win.VildaPanelPacjent;
    const ticket = panel.captureWriteAuthority(), before = h.main();
    h.current.win.confirm = vi.fn(() => false);
    h.current.api.restoreLoadedState({ ...h.current.options, data: clone(OLD), anyDataEntered: () => true });
    expect(h.current.win.confirm).toHaveBeenCalledTimes(1);
    expect(panel.isWriteAuthorityCurrent(ticket)).toBe(true);
    expect(h.writes).toEqual([]);
    expect(h.main()).toEqual(before); h.assertReference();
  });

  it('global explicit cleanup remains available even from a no-longer-active document', () => {
    const h = harness();
    expect(h.old.win.VildaPersistence.clearUserState({ includeSessions: true, includeModuleState: false, source: 'fictional-vault-lock' })).toBe(true);
    expect(h.main()).toBeNull();
  });
});
