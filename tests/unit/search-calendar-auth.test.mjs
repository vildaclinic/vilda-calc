import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import {
  authDeferred, authProductionFunction, authProductionReturnProgram,
  authProductionSource, authReturnEnvironment, authSurface,
} from '../support/search-return-auth-harness.mjs';

const source = authProductionSource();
const program = authProductionReturnProgram(source);
const listenerStart = source.indexOf('if (i.document && i.document.addEventListener) {', source.indexOf('async function remSearchRestoreSource('));
if (listenerStart < 0) throw new Error('Missing production Search source lifecycle listeners');
const listeners = source.slice(listenerStart, source.indexOf('function remSearchUnavailable(', listenerStart));
const patientId = 'fictional-calendar-patient', note = { id: 'fictional-calendar-note', patientId };
const snapshot = () => ({ version: 1, query: 'Fikcyjna pacjentka Kalendarz', time: 'future', status: 'open',
  id: 'note:' + note.id, limit: 150, mode: 'detail', listScrollTop: 810, detailScrollTop: 1140, focus: null, origin: null });
const saved = (id = 'fictional-calendar-return') => ({ id, context: snapshot(), parent: null, sourcePath: 'index.html',
  sourceRoute: null, targetNoteId: note.id, targetPatientId: patientId, expiresAt: Date.now() + 1800000 });
const clone = value => value && JSON.parse(JSON.stringify(value));

// The encrypted boundary is independently tested with real vault/crypto in
// search-navigation.test.mjs. This adapter supplies validated UI data while the
// exact AuthUI production functions own every navigation/return decision.
function handoff() {
  let value = null;
  const api = { prepare: vi.fn(async input => { value = { ...clone(input), expiresAt: Date.now() + 1800000 }; return { id: input.id }; }),
    read: vi.fn(async (id, options) => { if (!value || value.id !== id) return null; const result = clone(value); if (options?.consume) value = null; return result; }),
    clear: vi.fn(id => { if (value && (!id || value.id === id)) { value = null; return true; } return false; }) };
  return { api, set: input => { value = clone(input); }, peek: () => clone(value) };
}
function environment({ path = 'index.html', bridge = handoff(), bootReady = true } = {}) {
  const open = vi.fn(async () => true), close = vi.fn();
  const e = authReturnEnvironment(program + '\n' + listeners + '\n' + authProductionFunction(source, '$t'), {
    tn: open, carePatientMount: null, GdAnulujRender: vi.fn(), le: {}, Rt: null, xa: null, ee: [], ge: [],
    Qn: vi.fn(), sn: false, pr: vi.fn(), oe: vi.fn(),
  }, source);
  let url = new URL('https://fictional.invalid/vilda-calc/' + path);
  e.win.URL = URL; e.win.URLSearchParams = URLSearchParams; e.win.crypto = crypto;
  e.win.location = { get href() { return url.href; }, get pathname() { return url.pathname; }, get hash() { return url.hash; },
    assign: vi.fn(), replace: vi.fn() };
  e.win.history = { state: { unrelatedRouterKey: 17 }, length: 5,
    replaceState: vi.fn((state, _title, href) => { e.win.history.state = state; if (href) url = new URL(href, url); }), go: vi.fn() };
  e.win.VildaAuthUI = { isBootReady: () => bootReady };
  e.win.VildaSearchNavigation = bridge.api;
  close.mockImplementation(() => { e.context.remB22Full = null; });
  e.context.remB22Full = { close };
  e.owner();
  return { ...e, bridge, open, close };
}

describe('production AuthUI forward calendar transfer', () => {
  it('prepares encrypted standalone context before closing or leaving the source', async () => {
    const e = environment(), token = e.context.remSearchCreateReturn(snapshot(), patientId);
    const order = [];
    e.bridge.api.prepare.mockImplementationOnce(async value => { order.push('prepare'); expect(e.close).not.toHaveBeenCalled(); return { id: value.id }; });
    e.context.Rt = authSurface();
    e.context.Qn.mockImplementation(() => order.push('quiet-history'));
    e.close.mockImplementation(() => { order.push('close'); e.context.remB22Full = null; });
    e.win.location.assign.mockImplementation(() => order.push('navigate'));
    expect(await e.context.remSearchNavigateCalendar(token, note)).toBe(true);
    expect(order).toEqual(['prepare', 'close', 'quiet-history', 'navigate']);
    expect(e.context.Qn).toHaveBeenCalledExactlyOnceWith({ quiet: true });
    expect(e.bridge.api.prepare).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: token, context: snapshot(),
      sourcePath: 'index.html', sourceRoute: null, targetNoteId: note.id, targetPatientId: patientId }));
    expect(e.win.location.assign).toHaveBeenCalledExactlyOnceWith('terminarz.html#vilda-event=' + note.id + '&vilda-search-return=' + token);
    expect(e.win.location.assign.mock.calls[0][0]).not.toContain(snapshot().query);
    expect(e.win.history.state).toEqual({ unrelatedRouterKey: 17, vildaSearchCalendarSource: token });
    expect(e.context.remSearchCalendarTransferCurrent(e.context.remSearchCurrentReturn(token).calendarTransfer)).toBe(true);
  });

  it('shell transport keeps its exact descriptor and does not create a standalone handoff', async () => {
    const e = environment(); e.win.VildaShell = { getCurrentRoute: () => 'docpro', navigate: vi.fn() };
    const token = e.context.remSearchCreateReturn(snapshot(), patientId);
    expect(await e.context.remSearchNavigateCalendar(token, note)).toBe(true);
    const descriptor = e.context.remSearchCurrentReturn(token).calendarTransfer;
    expect(e.win.VildaShell.navigate).toHaveBeenCalledExactlyOnceWith('terminarz', true,
      'terminarz.html#vilda-event=' + note.id + '&vilda-search-return=' + token, null, { searchCalendarTransfer: descriptor });
    expect(descriptor.sourceRoute).toBe('docpro'); expect(descriptor.standalone).toBe(false);
    expect(e.bridge.api.prepare).not.toHaveBeenCalled(); expect(e.win.location.assign).not.toHaveBeenCalled();
    expect(e.context.remSearchLeaveRoute({ searchCalendarTransfer: descriptor })).toBe(true);
    expect(e.context.remSearchCurrentReturn(token)).not.toBeNull();
    expect(e.context.remSearchCalendarTransferCurrent({ ...descriptor })).toBe(false);
    e.context.remSearchLeaveRoute(); expect(e.context.remSearchCurrentReturn(token)).toBeNull();
  });

  it.each(['new-intent', 'lock', 'same-user-unlock', 'pagehide'])('a pending prepare cannot navigate after %s', async boundary => {
    const e = environment(), waiting = authDeferred();
    e.bridge.api.prepare.mockImplementationOnce(() => waiting.promise);
    const token = e.context.remSearchCreateReturn(snapshot(), patientId);
    const pending = e.context.remSearchNavigateCalendar(token, note);
    let newer;
    if (boundary === 'new-intent') newer = e.context.remSearchCreateReturn({ ...snapshot(), query: 'Fikcyjna nowa intencja' }, patientId);
    if (boundary === 'lock') e.lock();
    if (boundary === 'same-user-unlock') { e.lock(); e.unlock(); }
    if (boundary === 'pagehide') e.win.dispatchEvent(new Event('pagehide'));
    const closesBeforeCompletion = e.close.mock.calls.length;
    expect(closesBeforeCompletion).toBe(boundary === 'lock' || boundary === 'same-user-unlock' ? 1 : 0);
    waiting.resolve({ id: token });
    expect(await pending).toBe(false); expect(e.win.location.assign).not.toHaveBeenCalled(); expect(e.close).toHaveBeenCalledTimes(closesBeforeCompletion);
    if (newer) expect(e.context.remSearchCurrentReturn(newer)).not.toBeNull();
  });

  it('a failed encrypted prepare retains the source instead of navigating without a return path', async () => {
    const e = environment(), error = new Error('FICTIONAL_HANDOFF_QUOTA'); e.bridge.api.prepare.mockRejectedValueOnce(error);
    const token = e.context.remSearchCreateReturn(snapshot(), patientId);
    await expect(e.context.remSearchNavigateCalendar(token, note)).rejects.toBe(error);
    expect(e.close).not.toHaveBeenCalled(); expect(e.win.location.assign).not.toHaveBeenCalled();
  });

  it('pagehide retains an already approved descriptor for a BFCache return', async () => {
    const e = environment(), token = e.context.remSearchCreateReturn(snapshot(), patientId);
    await e.context.remSearchNavigateCalendar(token, note);
    const descriptor = e.context.remSearchCurrentReturn(token).calendarTransfer;
    e.win.dispatchEvent(new Event('pagehide'));
    expect(e.context.remSearchCurrentReturn(token)).not.toBeNull();
    expect(e.context.remSearchCalendarTransferCurrent(descriptor)).toBe(true);
  });
});

describe('production AuthUI target descriptor import', () => {
  it('imports the encrypted ticket under the fresh document owner and returns without consuming source context', async () => {
    const e = environment({ path: 'terminarz.html' }), value = saved(); e.bridge.set(value);
    const target = await e.context.remSearchResolveCalendarTarget(value.id);
    expect(target).toMatchObject({ expectedPatientId: patientId, expectedNoteId: note.id });
    expect(target.isCurrent()).toBe(true); expect(e.context.remSearchCurrentReturn(value.id).context).toEqual(snapshot());
    expect(e.bridge.api.read).toHaveBeenCalledExactlyOnceWith(value.id, { consume: false });
    expect(e.bridge.peek()).toEqual(value);
    expect(e.win.history.state).toEqual({ unrelatedRouterKey: 17, vildaSearchCalendarTarget: { token: value.id, steps: 1 } });
    expect(await target.onReturn()).toBe(true); expect(e.win.history.go).toHaveBeenCalledExactlyOnceWith(-1);
    expect(e.bridge.api.read).toHaveBeenCalledOnce(); expect(e.open).not.toHaveBeenCalled();
  });

  it.each(['lock', 'same-user-unlock', 'new-intent'])('a delayed decrypt cannot import a target after %s', async boundary => {
    const e = environment({ path: 'terminarz.html' }), value = saved(), waiting = authDeferred();
    e.bridge.api.read.mockImplementationOnce(() => waiting.promise);
    const pending = e.context.remSearchResolveCalendarTarget(value.id);
    let newer;
    if (boundary === 'new-intent') newer = e.context.remSearchCreateReturn({ ...snapshot(), query: 'Fikcyjne nowsze zapytanie' }, patientId);
    if (boundary === 'lock') e.lock();
    if (boundary === 'same-user-unlock') { e.lock(); e.unlock(); }
    waiting.resolve(value);
    expect(await pending).toBeNull(); expect(e.open).not.toHaveBeenCalled();
    if (newer) expect(e.context.remSearchCurrentReturn(newer)).not.toBeNull();
    else expect(e.context.remSearchCurrentReturn(value.id)).toBeNull();
  });

  it('rejects an expired descriptor and a descriptor superseded by a newer ticket', async () => {
    const e = environment({ path: 'terminarz.html' }), expired = { ...saved(), expiresAt: Date.now() - 1 }; e.bridge.set(expired);
    expect(await e.context.remSearchResolveCalendarTarget(expired.id)).toBeNull();
    e.context.remSearchDropReturn(); const value = saved('fictional-new-calendar-return'); e.bridge.set(value);
    const target = await e.context.remSearchResolveCalendarTarget(value.id);
    e.context.remSearchCreateReturn(snapshot(), patientId);
    expect(target.isCurrent()).toBe(false); expect(target.onReturn()).toBe(false);
  });

  it('uses only an opaque source fallback when no owned native Back journey exists', async () => {
    const e = environment({ path: 'terminarz.html' }), value = saved(); e.bridge.set(value);
    const descriptor = await e.context.remSearchGetCalendarTransfer(value.id);
    expect(await e.context.remSearchResumeCalendarTransfer(descriptor)).toBe(true);
    expect(e.win.location.replace).toHaveBeenCalledExactlyOnceWith('index.html#vilda-search-source=' + value.id);
    expect(e.bridge.peek()).toEqual(value); expect(e.open).not.toHaveBeenCalled();
  });

  it('a target opened from Search already in Terminarz returns by native Back even when both paths match', async () => {
    const value = { ...saved(), sourcePath: 'terminarz.html' };
    const e = environment({ path: 'terminarz.html#vilda-event=' + note.id + '&vilda-search-return=' + value.id }); e.bridge.set(value);
    const target = await e.context.remSearchResolveCalendarTarget(value.id);
    expect(target.isCurrent()).toBe(true);
    expect(await target.onReturn()).toBe(true);
    expect(e.win.history.go).toHaveBeenCalledExactlyOnceWith(-1);
    expect(e.win.location.replace).not.toHaveBeenCalled(); expect(e.open).not.toHaveBeenCalled();
    expect(e.bridge.api.read).toHaveBeenCalledExactlyOnceWith(value.id, { consume: false });
    expect(e.bridge.peek()).toEqual(value);
  });

  it('does not read handoff context until AuthUI has finished restoring its session', async () => {
    const e = environment({ path: 'terminarz.html', bootReady: false }); e.bridge.set(saved());
    expect(await e.context.remSearchGetCalendarTransfer(saved().id)).toBeNull();
    expect(await e.context.remSearchRestoreSource(saved().id)).toBe(false);
    expect(e.bridge.api.read).not.toHaveBeenCalled();
  });
});

describe('production AuthUI source restoration', () => {
  it('a normal target boot without a source marker leaves the encrypted return ticket untouched', async () => {
    const value = saved(), e = environment({ path: 'terminarz.html#vilda-event=' + note.id + '&vilda-search-return=' + value.id });
    e.bridge.set(value);
    expect(await e.context.remSearchRestoreSource()).toBe(false);
    expect(e.bridge.api.clear).not.toHaveBeenCalled(); expect(e.bridge.api.read).not.toHaveBeenCalled();
    expect(e.bridge.peek()).toEqual(value); expect(e.open).not.toHaveBeenCalled();
  });

  it('a target with a copied source marker for the same token is not consumed as a source, and resolution removes that marker', async () => {
    const value = saved(), e = environment({ path: 'terminarz.html#vilda-event=' + note.id + '&vilda-search-return=' + value.id });
    e.bridge.set(value);
    e.win.history.state.vildaSearchCalendarSource = value.id;
    e.win.history.state.vildaSearchCalendarTarget = { token: value.id, steps: 2 };
    expect(await e.context.remSearchRestoreSource()).toBe(false);
    expect(e.bridge.api.clear).not.toHaveBeenCalled(); expect(e.bridge.api.read).not.toHaveBeenCalled();
    expect(e.bridge.peek()).toEqual(value); expect(e.open).not.toHaveBeenCalled();
    const target = await e.context.remSearchResolveCalendarTarget(value.id);
    expect(target.isCurrent()).toBe(true);
    expect(e.bridge.api.read).toHaveBeenCalledExactlyOnceWith(value.id, { consume: false });
    expect(e.win.history.state).toEqual({ unrelatedRouterKey: 17, vildaSearchCalendarTarget: { token: value.id, steps: 2 } });
    expect(e.bridge.api.clear).not.toHaveBeenCalled(); expect(e.bridge.peek()).toEqual(value);
  });

  it('an ordinary new page without a source or target marker cancels an older encrypted return ticket', async () => {
    const e = environment(); e.bridge.set(saved());
    expect(await e.context.remSearchRestoreSource()).toBe(false);
    expect(e.bridge.api.clear).toHaveBeenCalledExactlyOnceWith();
    expect(e.bridge.api.read).not.toHaveBeenCalled(); expect(e.bridge.peek()).toBeNull();
    expect(e.open).not.toHaveBeenCalled();
  });

  it('validates source before consuming and restores Search exactly once while preserving unrelated history state', async () => {
    const e = environment(), value = saved(); e.bridge.set(value);
    e.win.history.state.vildaSearchCalendarSource = value.id;
    expect(await e.context.remSearchRestoreSource()).toBe(true);
    expect(e.bridge.api.read.mock.calls).toEqual([[value.id, { consume: false, isCurrent: expect.any(Function) }], [value.id, { consume: true, isCurrent: expect.any(Function) }]]);
    expect(e.open).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ force: true, globalSearch: snapshot() }));
    expect(e.win.history.state).toEqual({ unrelatedRouterKey: 17 });
    expect(e.bridge.peek()).toBeNull(); expect(await e.context.remSearchRestoreSource(value.id)).toBe(false);
    expect(e.open).toHaveBeenCalledOnce();
  });

  it('a wrong source path cannot consume the only return ticket', async () => {
    const e = environment(), value = { ...saved(), sourcePath: 'docpro.html' }; e.bridge.set(value);
    expect(await e.context.remSearchRestoreSource(value.id)).toBe(false);
    expect(e.bridge.api.read).toHaveBeenCalledExactlyOnceWith(value.id, { consume: false, isCurrent: expect.any(Function) });
    expect(e.bridge.peek()).toEqual(value); expect(e.open).not.toHaveBeenCalled();
  });

  it('Terminarz source navigation clears its former target role and an explicit source marker wins over a retained old target hash', async () => {
    const oldHash = '#vilda-event=fictional-previous-event&vilda-search-return=fictional-previous-token';
    const outgoing = environment({ path: 'terminarz.html' + oldHash });
    outgoing.win.history.state.vildaSearchCalendarTarget = { token: 'fictional-previous-token', steps: 3 };
    const token = outgoing.context.remSearchCreateReturn(snapshot(), patientId);
    expect(await outgoing.context.remSearchNavigateCalendar(token, note)).toBe(true);
    expect(outgoing.win.location.hash).toBe('');
    expect(outgoing.win.history.state).toEqual({ unrelatedRouterKey: 17, vildaSearchCalendarSource: token });
    const returned = environment({ path: 'terminarz.html' + oldHash, bridge: outgoing.bridge });
    returned.win.history.state = { ...outgoing.win.history.state };
    expect(await returned.context.remSearchRestoreSource()).toBe(true);
    expect(returned.bridge.api.read.mock.calls.slice(-2)).toEqual([[token, { consume: false, isCurrent: expect.any(Function) }], [token, { consume: true, isCurrent: expect.any(Function) }]]);
    expect(returned.open).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ globalSearch: snapshot() }));
    expect(returned.win.history.state).toEqual({ unrelatedRouterKey: 17 });
  });

  it('concurrent source callbacks share one restore and consume only once', async () => {
    const e = environment(), value = saved(), waiting = authDeferred(); e.bridge.set(value);
    e.bridge.api.read.mockImplementationOnce(() => waiting.promise);
    const first = e.context.remSearchRestoreSource(value.id), second = e.context.remSearchRestoreSource(value.id);
    waiting.resolve(value);
    expect(await first).toBe(true); expect(await second).toBe(true);
    expect(e.bridge.api.read.mock.calls).toEqual([[value.id, { consume: false, isCurrent: expect.any(Function) }], [value.id, { consume: true, isCurrent: expect.any(Function) }]]);
    expect(e.open).toHaveBeenCalledOnce();
  });

  it.each(['before-consume', 'during-consume'])('a newer UI intent wins over source decrypt %s', async phase => {
    const e = environment(), value = saved(), waiting = authDeferred(); e.bridge.set(value);
    if (phase === 'before-consume') e.bridge.api.read.mockImplementationOnce(() => waiting.promise);
    else e.bridge.api.read.mockResolvedValueOnce(value).mockImplementationOnce(() => waiting.promise);
    const pending = e.context.remSearchRestoreSource(value.id);
    if (phase === 'during-consume') { await Promise.resolve(); await Promise.resolve(); }
    const newer = e.context.remSearchCreateReturn({ ...snapshot(), query: 'Fikcyjne nowsze źródło' }, patientId);
    waiting.resolve(value);
    expect(await pending).toBe(false); expect(e.open).not.toHaveBeenCalled();
    expect(e.context.remSearchCurrentReturn(newer)).not.toBeNull();
  });

  it.each(['preview', 'consume'])('Forward to the target during source %s leaves its ticket and target history intact', async phase => {
    const e = environment({ path: 'terminarz.html' }), value = { ...saved(), sourcePath: 'terminarz.html' }, waiting = authDeferred();
    e.bridge.set(value); e.win.history.state.vildaSearchCalendarSource = value.id;
    const read = e.bridge.api.read.getMockImplementation();
    if (phase === 'preview') e.bridge.api.read.mockImplementationOnce(() => waiting.promise);
    else e.bridge.api.read.mockResolvedValueOnce(value).mockImplementationOnce(async (...args) => {
      await waiting.promise; return args[1].isCurrent() ? read(...args) : null;
    });
    const pending = e.context.remSearchRestoreSource();
    const expectedReads = phase === 'preview' ? 1 : 2;
    for (let attempt = 0; attempt < 10 && e.bridge.api.read.mock.calls.length < expectedReads; attempt++) await Promise.resolve();
    expect(e.bridge.api.read).toHaveBeenCalledTimes(expectedReads);
    const targetState = { unrelatedRouterKey: 17, vildaSearchCalendarTarget: { token: value.id, steps: 1 } };
    e.win.history.replaceState(targetState, '', 'terminarz.html#vilda-event=' + note.id + '&vilda-search-return=' + value.id);
    e.win.dispatchEvent(new Event('popstate')); e.win.dispatchEvent(new Event('hashchange'));
    waiting.resolve(value);
    expect(await pending).toBe(false);
    expect(e.bridge.api.read).toHaveBeenCalledTimes(expectedReads);
    expect(e.bridge.peek()).toEqual(value); expect(e.open).not.toHaveBeenCalled();
    expect(e.win.history.state).toEqual(targetState);
    expect(e.win.location.hash).toBe('#vilda-event=' + note.id + '&vilda-search-return=' + value.id);
    expect(e.win.history.replaceState).toHaveBeenCalledOnce();
  });

  it('Forward after consumption prevents the real reminders read from rendering the older source Search', async () => {
    const e = environment({ path: 'terminarz.html' }), value = { ...saved(), sourcePath: 'terminarz.html' };
    const waiting = authDeferred(), render = vi.fn(), readError = vi.fn();
    e.bridge.set(value); e.win.history.state.vildaSearchCalendarSource = value.id;
    e.vault.listPatientNotesDueByDate = vi.fn(() => waiting.promise);
    Object.assign(e.context, { remMaybeReadSequence: 0, remMaybeForced: null, Fa: () => '2026-11-02',
      wn: vi.fn(), Mr: render, remShowReadError: readError });
    // Execute the real final read/render boundary, including its production
    // _searchReturnCurrent guard, after source consumption has already finished.
    vm.runInContext(authProductionFunction(source, 'tn'), e.context);
    const pending = e.context.remSearchRestoreSource();
    for (let attempt = 0; attempt < 10 && !e.vault.listPatientNotesDueByDate.mock.calls.length; attempt++) await Promise.resolve();
    expect(e.vault.listPatientNotesDueByDate).toHaveBeenCalledOnce();
    expect(e.bridge.api.read.mock.calls.filter(([, options]) => options.consume)).toHaveLength(1);
    expect(e.bridge.peek()).toBeNull();
    const targetState = { unrelatedRouterKey: 17, vildaSearchCalendarTarget: { token: value.id, steps: 1 } };
    e.win.history.replaceState(targetState, '', 'terminarz.html#vilda-event=' + note.id + '&vilda-search-return=' + value.id);
    e.win.dispatchEvent(new Event('popstate')); e.win.dispatchEvent(new Event('hashchange'));
    waiting.resolve([{ patientId, notes: [] }]);
    expect(await pending).toBe(false);
    expect(render).not.toHaveBeenCalled(); expect(readError).not.toHaveBeenCalled();
    expect(e.win.history.state).toEqual(targetState);
    expect(e.win.location.hash).toBe('#vilda-event=' + note.id + '&vilda-search-return=' + value.id);
  });

  it('source→target→source starts a newer restore and rejects the old read even though its final URL matches', async () => {
    const e = environment({ path: 'terminarz.html' }), value = { ...saved(), sourcePath: 'terminarz.html' };
    const older = authDeferred(), newer = authDeferred(); e.bridge.set(value);
    const sourceURL = e.win.location.href, sourceState = { unrelatedRouterKey: 17, vildaSearchCalendarSource: value.id };
    e.win.history.state = sourceState;
    e.bridge.api.read.mockImplementationOnce(() => older.promise).mockImplementationOnce(() => newer.promise);
    const oldPending = e.context.remSearchRestoreSource();
    e.win.history.replaceState({ unrelatedRouterKey: 17, vildaSearchCalendarTarget: { token: value.id, steps: 1 } }, '',
      'terminarz.html#vilda-event=' + note.id + '&vilda-search-return=' + value.id);
    e.win.dispatchEvent(new Event('hashchange'));
    e.win.history.replaceState(sourceState, '', sourceURL);
    e.win.dispatchEvent(new Event('popstate')); e.win.dispatchEvent(new Event('hashchange'));
    const newPending = e.context.remSearchSourceRestore;
    expect(newPending).not.toBeNull(); expect(e.bridge.api.read).toHaveBeenCalledTimes(2);
    expect(e.bridge.api.read.mock.calls[0][1].isCurrent()).toBe(false);
    older.resolve(value);
    expect(await oldPending).toBe(false); expect(e.open).not.toHaveBeenCalled();
    expect(e.context.remSearchSourceRestore).toBe(newPending); expect(e.bridge.peek()).toEqual(value);
    newer.resolve(value);
    expect(await newPending).toBe(true);
    expect(e.open).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ globalSearch: snapshot() }));
    expect(e.bridge.api.read.mock.calls.filter(([, options]) => options.consume)).toHaveLength(1);
    expect(e.bridge.peek()).toBeNull();
  });

  it('standalone parent-plan restoration retains its Search origin', async () => {
    const e = environment(), value = { ...saved(), parent: { kind: 'plan', planId: 'fictional-plan', recordId: 'fictional-result' } }; e.bridge.set(value);
    expect(await e.context.remSearchRestoreSource(value.id)).toBe(true);
    expect(e.open).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ globalSearch: null, searchContext: snapshot(),
      carePlans: true, planId: 'fictional-plan', careRecordId: 'fictional-result' }));
  });
});
