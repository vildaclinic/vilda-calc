import { describe, expect, it, vi } from 'vitest';
import { setImmediate as settle } from 'node:timers/promises';
import {
  authDeferred, authProductionFunction, authProductionReturnProgram,
  authProductionSource, authReturnEnvironment,
} from '../support/search-return-auth-harness.mjs';

const source = authProductionSource();
const patientId = 'fictional-care-return-patient';
const planId = 'fictional-care-return-plan';
const recordId = 'fictional-care-return-record';
const searchContext = () => ({ version: 1, query: 'Fikcyjny wynik planu', time: 'future', status: 'open',
  id: 'plan:' + planId, limit: 100, mode: 'detail', listScrollTop: 820, detailScrollTop: 410,
  focus: null, origin: null });
const record = (id = recordId) => ({ id, patientId, title: 'Fikcyjny wynik planu',
  careContext: { version: 1, role: 'result', planId } });

function environment() {
  const sourceHost = { alive: true }, callbacks = [];
  const position = { planId, noteId: recordId, detail: true };
  const view = { getContext: vi.fn(() => ({ ...position })), select: vi.fn(), create: vi.fn(),
    refreshNavigation: vi.fn(), destroy: vi.fn() };
  const module = { mount: vi.fn((_host, options) => { callbacks.push(options); return view; }) };
  const close = vi.fn(() => { sourceHost.alive = false; });
  const editor = vi.fn(), open = vi.fn(async () => true);
  let fixture, owner;
  const production = [authProductionReturnProgram(source),
    ...['careSearchNavigationStart', 'careSearchNavigationCurrent', 'mountCare', 'switchTab', 'closed']
      .map(name => authProductionFunction(source, name, 'remB22Create')),
    authProductionFunction(source, '$t'),
  ].join('\n');
  fixture = authReturnEnvironment(production, {
    full: true, careView: null, careHost: {}, searchView: null, searchNavigation: null,
    careReturn: { tab: 'search', searchContext: searchContext() },
    state: { tab: 'plans', editing: false, busy: false, historyReady: true, historyLoading: false },
    sequence: 0, root: { classList: { remove: vi.fn() } },
    alive: () => sourceHost.alive && fixture.current(owner), close, ga: editor, tn: open,
    CareProtectNativeEditor: vi.fn(), privacy: null,
    clear: vi.fn(), make: vi.fn(), render: vi.fn(), counts: vi.fn(), changed: vi.fn(),
    remB22Request: vi.fn(), openSearchPatient: vi.fn(), refresh: vi.fn(),
    search: {}, list: {}, historyTab: {}, activeTab: {},
    carePatientMount: null, GdAnulujRender: vi.fn(), le: {}, Rt: null,
    xa: null, ee: [], ge: [], Qn: vi.fn(), sn: false, pr: vi.fn(), oe: vi.fn(),
  }, source);
  owner = fixture.owner();
  fixture.context.vault = fixture.vault; fixture.win.VildaCarePlans = module;
  fixture.vault.getPatientNote = vi.fn(async id => record(id));
  fixture.context.mountCare(planId, false, recordId);
  expect(callbacks).toHaveLength(1);
  const invoke = (kind, id = recordId) => kind === 'calendar'
    ? callbacks[0].openCalendar(id)
    : callbacks[0].openRecordDetails(record(id), vi.fn(), () => true);
  return { ...fixture, callbacks: callbacks[0], invoke, position, view, close, editor, open, sourceHost };
}

describe.each(['calendar', 'record'])('production care-plan %s navigation from Search', kind => {
  it('opens its editor and returns once to the parent plan with the original Search context', async () => {
    const e = environment();
    expect(await e.invoke(kind)).toBe(true);
    expect(e.vault.getPatientNote).toHaveBeenCalledExactlyOnceWith(recordId);
    expect(e.close).toHaveBeenCalledOnce();
    expect(e.editor).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ patientId, note: record() }));
    const token = e.context.remSearchPatientReturn(patientId);
    expect(e.context.remSearchCurrentReturn(token).parent).toEqual({ kind: 'plan', planId, recordId });
    e.editor.mock.calls[0][0].onCancel(); await settle();
    expect(e.open).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      force: true, carePlans: true, planId, careRecordId: recordId,
      globalSearch: null, searchContext: searchContext(),
    }));
    e.editor.mock.calls[0][0].onSaved(); await settle();
    expect(e.open).toHaveBeenCalledOnce();
  });

  it('propagates a current read failure so the care-plan surface can show its error', async () => {
    const e = environment(), error = new Error('FICTIONAL_CURRENT_CARE_READ_FAILURE');
    e.vault.getPatientNote.mockRejectedValueOnce(error);
    await expect(e.invoke(kind)).rejects.toBe(error);
    expect(e.editor).not.toHaveBeenCalled(); expect(e.close).not.toHaveBeenCalled();
    expect(e.open).not.toHaveBeenCalled();
    expect(e.context.searchNavigation).toBeNull(); expect(e.context.remSearchReturn).toBeNull();
  });

  it('a missing record leaves no unused return ticket behind', async () => {
    const e = environment(); e.vault.getPatientNote.mockResolvedValueOnce(null);
    expect(await e.invoke(kind)).toBe(false);
    expect(e.editor).not.toHaveBeenCalled(); expect(e.close).not.toHaveBeenCalled();
    expect(e.context.searchNavigation).toBeNull(); expect(e.context.remSearchReturn).toBeNull();
  });

  const boundaries = ['tab', 'plan', 'record', 'detail', 'origin', 'close', 'lock', 'same-user-unlock'];
  it.each(boundaries.flatMap(boundary => ['resolve', 'reject'].map(outcome => ({ boundary, outcome }))))(
    'suppresses a late $outcome after changing $boundary', async ({ boundary, outcome }) => {
      const e = environment(), waiting = authDeferred();
      e.vault.getPatientNote.mockImplementationOnce(() => waiting.promise);
      const pending = e.invoke(kind);
      expect(e.context.state.busy).toBe(false);
      if (boundary === 'tab') await e.context.switchTab('active');
      if (boundary === 'plan') e.position.planId = 'fictional-other-plan';
      if (boundary === 'record') e.position.noteId = 'fictional-other-record';
      if (boundary === 'detail') e.position.detail = false;
      if (boundary === 'origin') e.context.careReturn = { tab: 'search', searchContext: searchContext() };
      if (boundary === 'close') e.context.closed();
      if (boundary === 'lock') e.lock();
      if (boundary === 'same-user-unlock') { e.lock(); e.unlock(); }
      if (outcome === 'resolve') waiting.resolve(record());
      else waiting.reject(new Error('FICTIONAL_CANCELLED_CARE_READ_FAILURE'));
      expect(await pending).toBe(false);
      expect(e.editor).not.toHaveBeenCalled(); expect(e.open).not.toHaveBeenCalled();
      expect(e.close).toHaveBeenCalledTimes(boundary === 'close' ? 1 : 0);
    });

  it.each(['resolve', 'reject'])('a superseded older %s cannot open or cancel the newer editor', async outcome => {
    const e = environment(), olderRead = authDeferred(), newerRead = authDeferred();
    e.vault.getPatientNote.mockImplementationOnce(() => olderRead.promise).mockImplementationOnce(() => newerRead.promise);
    const older = e.invoke(kind);
    const newerId = 'fictional-newer-care-record', newer = e.invoke(kind, newerId);
    const newerNavigation = e.context.searchNavigation;
    if (outcome === 'resolve') olderRead.resolve(record());
    else olderRead.reject(new Error('FICTIONAL_SUPERSEDED_CARE_READ_FAILURE'));
    expect(await older).toBe(false);
    expect(e.context.searchNavigation).toBe(newerNavigation);
    expect(e.editor).not.toHaveBeenCalled(); expect(e.close).not.toHaveBeenCalled();
    newerRead.resolve(record(newerId));
    expect(await newer).toBe(true);
    expect(e.editor).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ note: record(newerId) }));
  });
});
