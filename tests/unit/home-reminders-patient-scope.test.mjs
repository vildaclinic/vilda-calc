import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { authProductionFunction } from '../support/search-return-auth-harness.mjs';

const source = fs.readFileSync(new URL('../../vilda_auth_ui.js', import.meta.url), 'utf8');
const production = (name, parent) => authProductionFunction(source, name, parent);
const globals = ['HomeRemindersPresentationRequested', 'remInlineHide', 'HomeRemindersContextCurrent', 'HomeRemindersInlineContext', 'HomeRemindersInlineViewOptions', 'HomeRemindersDisposeEditors', 'HomeRemindersDisposeScope'];
const own = ['HomeRemindersOwnNote', 'HomeRemindersOwnRow', 'HomeRemindersRows', 'HomeRemindersCurrent', 'HomeRemindersReadGroups'];
const note = (patientId, id, extra = {}) => ({ patientId, id, dueDateISO: '2026-11-20', category: 'followup', ...extra });
const group = (patientId, notes) => ({ patientId, patientName: 'Fikcyjny ' + patientId, notes });
function base() {
  const state = { current: true, marked: true, owner: true }, owner = {};
  const host = { style: { removeProperty(name) { delete this[name]; } }, childNodes: [], isConnected: true, removeAttribute: vi.fn() };
  const win = { top: null, document: { querySelector: () => null }, __VILDA_HOME_WORKSPACE_PREVIEW__: true, VildaHomeRemindersPresentation: { decorate() {} } }; win.top = win;
  const ctx = vm.createContext({ i: win, HomeRemindersContexts: new WeakMap(), HomeRemindersEditorLeases: new Set(),
    remReadOwner: () => owner, remReadCurrent: candidate => candidate === owner && state.owner,
    HomeRemindersInlineEnabled: () => state.marked, remInvalidateInline: vi.fn(),
    remB22Views: new WeakMap(), remB22Full: null, oe: vi.fn(), Nr: vi.fn(), Fr: () => false, owner });
  vm.runInContext(globals.map(name => production(name)).join('\n'), ctx);
  const options = { homePresentation: true, patientId: 'A', contextLabel: 'Fikcyjny A', showPatientName: false, isCurrent: () => state.current };
  return { ctx, host, options, state, owner };
}
function scope(e) {
  const context = e.ctx.HomeRemindersInlineContext(e.host, e.options);
  e.ctx.HomeRemindersContext = context;
  vm.runInContext(own.map(name => production(name, 'remB22Create')).join('\n'), e.ctx);
  return context;
}

describe('selected-patient reminders reuse native data boundaries', () => {
  it('shows only reminders recorded by the historical visit and keeps the patient boundary', () => {
    const e = base();
    e.options.encounter = { mode: 'edit', visitId: 'chosen', date: '2026-07-04' };
    scope(e);
    const linked = (id, date, visitId, patient = 'A') => note(patient, id, {
      clinicalDateISO: date, reminderContext: { kind: 'reminder' }, visitContext: { version: 1, clinicalDateISO: date, visitId }
    });
    const records = [
      linked('earlier', '2026-07-03', 'older'), linked('same', '2026-07-04', 'chosen'),
      linked('different', '2026-07-04', 'another'), linked('later', '2026-07-05', 'newer'),
      linked('foreign', '2026-07-04', 'chosen', 'B'),
      note('A', 'patient-wide', { createdAtISO: '2026-06-01T12:00:00Z' }),
      note('A', 'future-patient-wide', { createdAtISO: '2026-08-01T12:00:00Z' })
    ];
    expect(records.filter(e.ctx.HomeRemindersOwnNote).map(record => record.id)).toEqual(['earlier', 'same', 'patient-wide']);
  });
  it('snapshots the patient, shares an origin-frame lifetime, and retains an inactive tombstone until Home mode ends', () => {
    const e = base(), context = scope(e);
    e.options.patientId = 'B';
    expect(context.patientId).toBe('A'); expect(e.ctx.HomeRemindersContextCurrent(context)).toBe(true);
    e.state.current = false; expect(e.ctx.HomeRemindersContextCurrent(context)).toBe(false);
    e.state.current = true; e.state.owner = false; expect(e.ctx.HomeRemindersContextCurrent(context)).toBe(false);
    e.state.owner = true;
    const inline = { homeContext: context, close: vi.fn() }, full = { homeContext: context, close: vi.fn() };
    e.ctx.remB22Views.set(e.host, inline); e.ctx.remB22Full = full;
    expect(e.ctx.HomeRemindersDisposeScope(e.host, {})).toBe(false);
    expect(e.ctx.HomeRemindersDisposeScope(e.host, e.options)).toBe(true);
    expect(inline.close).toHaveBeenCalledOnce(); expect(full.close).toHaveBeenCalledOnce();
    expect(e.host.style.display).toBe('none'); expect(e.ctx.remInvalidateInline).toHaveBeenCalledWith(e.host);
    expect(e.ctx.HomeRemindersInlineContext(e.host)).toBe(context);
    expect(e.ctx.HomeRemindersContextCurrent(context)).toBe(false);
    const inactive = { homePresentation: true, patientId: null, isCurrent: () => true };
    const next = e.ctx.HomeRemindersInlineContext(e.host, inactive);
    expect(e.ctx.HomeRemindersContextCurrent(next)).toBe(false);
    e.state.marked = false; expect(e.ctx.HomeRemindersInlineContext(e.host)).toBeNull();
  });

  it('keeps the original global due groups for the bell and supplies a separate native future read to the scoped view', async () => {
    const e = base(), context = scope(e), attributes = new Map(), inlineState = { sequence: 0 };
    const due = [group('A', [note('A', 'a-today')]), group('B', [note('B', 'b-today')])];
    const future = due.concat(group('A', [note('A', 'a-future')]));
    const reader = vi.fn().mockResolvedValueOnce(due).mockResolvedValueOnce(future);
    e.owner.vault = { listPatientNotesDueByDate: reader };
    Object.assign(e.host, { setAttribute: (key, value) => attributes.set(key, value), removeAttribute: key => attributes.delete(key) });
    const setGroups = vi.fn(), badge = vi.fn(), view = { alive: () => true, homePresentation: true, homeContext: context, setGroups };
    e.ctx.remB22Views.set(e.host, view);
    Object.assign(e.ctx, { remInlineAllowed: () => true, remInlineState: () => inlineState,
      remBadgeRecover: vi.fn(), HomeRemindersInlineReadPhase: vi.fn(), remInlineError: vi.fn(), Ot: vi.fn(),
      Fa: () => '2026-11-20', Tr: badge, Nr: vi.fn(), HomeRemindersInlineEnabled: () => true });
    vm.runInContext(['remB22Flat', 'remB22Day', 'remB22Inline', 'Br'].map(name => production(name)).join('\n'), e.ctx);
    e.host.style.display = 'none';
    await e.ctx.Br(e.host, e.options);
    expect(Object.prototype.hasOwnProperty.call(e.host.style, 'display')).toBe(false);
    expect(reader.mock.calls).toEqual([[], ['9999-12-31T23:59:59.999Z']]);
    expect(setGroups).toHaveBeenCalledWith(future);
    expect(badge).toHaveBeenCalledWith(2);
    expect(e.ctx.HomeRemindersRows(future).map(row => row.n.id)).toEqual(['a-today', 'a-future']);
    expect(attributes.get('data-reminders-state')).toBe('ready');
  });

  it('rejects a late scoped read before paint or bell update after a patient change', async () => {
    const e = base(); scope(e);
    let release;
    const delayed = new Promise(resolve => { release = resolve; });
    e.owner.vault = { listPatientNotesDueByDate: vi.fn().mockResolvedValueOnce([]).mockReturnValueOnce(delayed) };
    const paint = vi.fn(), attributes = vi.fn(), inlineState = { sequence: 0 };
    Object.assign(e.host, { setAttribute: attributes, removeAttribute: vi.fn() });
    Object.assign(e.ctx, { remInlineAllowed: () => true, remInlineState: () => inlineState,
      HomeRemindersInlineReadPhase: vi.fn(), remBadgeRecover: vi.fn(), remB22Inline: paint,
      remInlineError: vi.fn(), Ot: vi.fn() });
    vm.runInContext(production('Br'), e.ctx);
    const pending = e.ctx.Br(e.host, e.options);
    await Promise.resolve(); e.state.current = false;
    release([group('A', [note('A', 'late-a')])]); await pending;
    expect(paint).not.toHaveBeenCalled(); expect(e.ctx.remBadgeRecover).not.toHaveBeenCalled();
    expect(attributes.mock.calls.some(([key]) => key === 'data-reminders-state')).toBe(false);
  });

  it('filters native history by patient before the native page limit can be applied', async () => {
    const e = base(); scope(e);
    const history = Array.from({ length: 70 }, (_, index) => note('B', 'b-' + index, { completedAtISO: '2026-11-18' }))
      .concat([note('A', 'a-older', { completedAtISO: '2025-01-01' }), note('A', 'a-pending'), note('A', 'a-absence', { category: 'absence', completedAtISO: '2026-11-18' })]);
    Object.assign(e.ctx, { sequence: 1, state: { editing: false }, alive: () => e.state.current,
      vault: { listReminderHistory: vi.fn().mockResolvedValue(history) }, HomeRemindersHistoryReadPhase: 'loading' });
    vm.runInContext(production('remA7DatedRow') + '\n' + production('loadHistory', 'remB22Create'), e.ctx);
    expect(await e.ctx.loadHistory(1)).toBe(true);
    expect(e.ctx.state.history.map(row => row.n.id)).toEqual(['a-older']);
    expect(e.ctx.vault.listReminderHistory.mock.calls).toEqual([[]]);
    expect(e.ctx.HomeRemindersHistoryReadPhase).toBe('ready');
  });

  it('rejects foreign linked notes before history, detached reads or plan navigation', async () => {
    const e = base(); scope(e);
    Object.assign(e.ctx, { sequence: 0, state: { editing: false, rows: [] }, alive: () => true,
      vault: { getPatientNote: vi.fn().mockResolvedValue(note('B', 'foreign', { careContext: { planId: 'foreign-plan' } })) },
      openCare: vi.fn(), loadHistory: vi.fn(), loadDetached: vi.fn(), report: vi.fn() });
    vm.runInContext(production('selectLinked', 'remB22Create'), e.ctx);
    await e.ctx.selectLinked('foreign');
    expect(e.ctx.openCare).not.toHaveBeenCalled(); expect(e.ctx.loadHistory).not.toHaveBeenCalled();
    expect(e.ctx.loadDetached).not.toHaveBeenCalled(); expect(e.ctx.state.selected).toBeUndefined();
  });

  it('uses native range eligibility but never resolves a detached note from a different patient', async () => {
    const e = base(); scope(e);
    const range = vi.fn().mockResolvedValue([note('B', 'same-id')]);
    Object.assign(e.ctx, { sequence: 1, state: { editing: false }, alive: () => true, vault: { listPatientNotesInRange: range } });
    vm.runInContext(production('remB22Day') + '\n' + production('remA7DatedRow') + '\n' + production('loadDetached', 'remB22Create'), e.ctx);
    expect(await e.ctx.loadDetached(note('B', 'foreign'), 1)).toBeNull(); expect(range).not.toHaveBeenCalled();
    expect(await e.ctx.loadDetached(note('A', 'same-id'), 1)).toBeNull();
    expect(range).toHaveBeenCalledWith('2026-11-20', '2026-11-20T23:59:59.999Z');
  });

  it('routes scoped edit to the originating native NoteHost, releases ordinary leases and suppresses stale callbacks', async () => {
    const e = base(), calls = [], saved = vi.fn(), cancelled = vi.fn();
    const editor = { destroy: vi.fn(), isCurrent: () => true, ready: Promise.resolve(true) };
    e.options.openNote = request => { calls.push(request); return editor; };
    scope(e); e.ctx.ga = vi.fn();
    vm.runInContext(production('HomeRemindersOpenEditor', 'remB22Create'), e.ctx);
    expect(e.ctx.HomeRemindersOpenEditor({ patientId: 'B', note: note('B', 'b') })).toBe(false);
    expect(e.ctx.HomeRemindersOpenEditor({ patientId: 'A', note: note('A', 'a'), onSaved: saved, onCancel: cancelled })).toBe(editor);
    await Promise.resolve(); expect(e.ctx.HomeRemindersEditorLeases.size).toBe(1);
    calls[0].onSaved(); expect(saved).toHaveBeenCalledOnce(); expect(e.ctx.HomeRemindersEditorLeases.size).toBe(0);
    e.ctx.HomeRemindersOpenEditor({ patientId: 'A', note: note('A', 'a'), onSaved: saved, onCancel: cancelled });
    e.state.current = false; e.ctx.HomeRemindersDisposeScope(e.host, e.options);
    expect(editor.destroy).toHaveBeenCalledOnce(); expect(e.ctx.HomeRemindersEditorLeases.size).toBe(0);
    calls[1].onCancel(); calls[1].onSaved(); expect(cancelled).not.toHaveBeenCalled(); expect(saved).toHaveBeenCalledOnce();
    expect(e.ctx.ga).not.toHaveBeenCalled();
    e.ctx.HomeRemindersContext = null; e.ctx.HomeRemindersOpenEditor({ patientId: 'B' });
    expect(e.ctx.ga).toHaveBeenCalledWith({ patientId: 'B' });
  });

  it('keeps native global reads at the daily cutoff and opts only the scoped actor into future reminders', async () => {
    const e = base(); scope(e);
    e.ctx.vault = { listPatientNotesDueByDate: vi.fn().mockResolvedValue([]) };
    await e.ctx.HomeRemindersReadGroups();
    expect(e.ctx.vault.listPatientNotesDueByDate).toHaveBeenLastCalledWith('9999-12-31T23:59:59.999Z');
    e.ctx.HomeRemindersContext = null; await e.ctx.HomeRemindersReadGroups();
    expect(e.ctx.vault.listPatientNotesDueByDate).toHaveBeenLastCalledWith();
  });
});

describe('selected-patient initial read failure', () => {
  it('opens a tracked scoped native error dialog and never falls back to the global retry overlay', async () => {
    const e = base(), context = scope(e), failed = vi.fn(), open = vi.fn((groups, options) => {
      e.ctx.remB22Full = { homeContext: options.homeContext, alive: () => e.state.current, showReadFailure: failed };
    });
    e.owner.vault = { isUnlocked: () => true, listPatientNotesDueByDate: vi.fn().mockRejectedValue(Error('Fikcyjna awaria odczytu')) };
    Object.assign(e.ctx, { remB22Open: open, remMaybeReadSequence: 0, remMaybeForced: null,
      jt: () => e.owner.vault, remSearchDropReturn: vi.fn(), Fa: () => '2026-11-20', wn: vi.fn(),
      Ot: vi.fn(), remShowReadError: vi.fn() });
    vm.runInContext(production('HomeRemindersShowReadFailure') + '\n' + production('tn'), e.ctx);
    expect(await e.ctx.tn({ force: true, homePresentation: true, homeContext: context, contextLabel: 'Fikcyjny A', showPatientName: false })).toBe(false);
    expect(open).toHaveBeenCalledWith([], { homePresentation: true, homeContext: context, contextLabel: 'Fikcyjny A', showPatientName: false });
    expect(failed).toHaveBeenCalledOnce(); expect(e.ctx.remShowReadError).not.toHaveBeenCalled();
    expect(e.owner.vault.listPatientNotesDueByDate.mock.calls).toEqual([['9999-12-31T23:59:59.999Z']]);
    e.state.current = false;
    expect(e.ctx.HomeRemindersShowReadFailure({ homeContext: context })).toBe(false);
    expect(open).toHaveBeenCalledOnce();
  });

  it('leaves the default global read-error path and daily reader unchanged', async () => {
    const e = base();
    e.owner.vault = { isUnlocked: () => true, listPatientNotesDueByDate: vi.fn().mockRejectedValue(Error('Fikcyjna awaria globalna')) };
    Object.assign(e.ctx, { remMaybeReadSequence: 0, remMaybeForced: null,
      jt: () => e.owner.vault, remSearchDropReturn: vi.fn(), Fa: () => '2026-11-20', wn: vi.fn(),
      Ot: vi.fn(), remShowReadError: vi.fn(), HomeRemindersShowReadFailure: vi.fn() });
    vm.runInContext(production('tn'), e.ctx);
    expect(await e.ctx.tn({ force: true })).toBe(false);
    expect(e.ctx.remShowReadError).toHaveBeenCalledWith(); expect(e.ctx.HomeRemindersShowReadFailure).not.toHaveBeenCalled();
    expect(e.owner.vault.listPatientNotesDueByDate.mock.calls).toEqual([[]]);
  });
});

describe('selected-patient edit cancellation restores native position', () => {
  it('restores the original history query, selection, page and scroll through the native tab reader', async () => {
    const e = base(); scope(e);
    const state = { tab: 'active', filter: 'all', query: '', historyReady: false, historyLoading: false, editing: false, busy: false, history: [] };
    Object.assign(e.ctx, { state, sequence: 0, searchNavigation: null, careReturn: null, full: true,
      keys: [['all'], ['today'], ['overdue'], ['pending']], search: { value: '' }, list: { scrollTop: 0 },
      root: { classList: { remove: vi.fn() } }, alive: () => e.state.current,
      vault: { listReminderHistory: vi.fn().mockResolvedValue([note('A', 'a-closed', { completedAtISO: '2026-11-18' }), note('B', 'b-closed', { completedAtISO: '2026-11-18' })]) },
      render: vi.fn(), visible: () => state.history, HomeRemindersUpdate: vi.fn(),
      HomeRemindersHistoryReadPhase: 'loading' });
    vm.runInContext(production('remA7DatedRow') + '\n' + ['loadHistory', 'switchTab', 'HomeRemindersRestorePosition'].map(name => production(name, 'remB22Create')).join('\n'), e.ctx);
    expect(await e.ctx.HomeRemindersRestorePosition({ tab: 'history', filter: 'today', query: 'Fikcyjne szukanie', selected: 'a-closed', historyLimit: 100, scrollTop: 416 })).toBe(true);
    expect(state).toMatchObject({ tab: 'history', filter: 'today', query: 'Fikcyjne szukanie', selected: 'a-closed', historyLimit: 100 });
    expect(state.history.map(row => row.n.id)).toEqual(['a-closed']);
    expect(e.ctx.search.value).toBe('Fikcyjne szukanie'); expect(e.ctx.list.scrollTop).toBe(416);
  });

  it('does not restore a late history position into a changed patient context', async () => {
    const e = base(); scope(e);
    let release; const pending = new Promise(resolve => { release = resolve; });
    const state = { tab: 'active', filter: 'all', query: '', historyReady: false, editing: false, busy: false };
    Object.assign(e.ctx, { state, sequence: 0, searchNavigation: null, careReturn: null, full: true,
      keys: [['all']], search: {}, list: { scrollTop: 0 }, root: { classList: { remove: vi.fn() } }, alive: () => e.state.current,
      vault: { listReminderHistory: vi.fn().mockReturnValue(pending) }, render: vi.fn(), visible: vi.fn(), HomeRemindersUpdate: vi.fn() });
    vm.runInContext(production('remA7DatedRow') + '\n' + ['loadHistory', 'switchTab', 'HomeRemindersRestorePosition'].map(name => production(name, 'remB22Create')).join('\n'), e.ctx);
    const restore = e.ctx.HomeRemindersRestorePosition({ tab: 'history', selected: 'a-closed', scrollTop: 416 });
    e.state.current = false; release([note('A', 'a-closed', { completedAtISO: '2026-11-18' })]);
    expect(await restore).toBe(false); expect(e.ctx.list.scrollTop).toBe(0); expect(e.ctx.visible).not.toHaveBeenCalled();
    expect(state.selected).toBeNull();
  });
});

describe('selected-patient native dialog history leases', () => {
  it('binds the shown main once, pairs child leases and releases all history even if decorative cleanup fails', () => {
    const e = base(), mainStop = vi.fn(), childStop = vi.fn();
    e.options.onDialog = vi.fn((_dialog, metadata) => metadata.kind === 'main' ? mainStop : childStop);
    scope(e);
    Object.assign(e.ctx, { full: true, root: { open: false }, alive: () => e.state.current,
      HomeRemindersMainCleanup: null, HomeRemindersOutcomeCleanup: null,
      HomeRemindersPresentation: { onDialog: vi.fn(() => () => { throw Error('Fikcyjny błąd dekoracji'); }), destroy: vi.fn() }, Ot: vi.fn() });
    vm.runInContext(['HomeRemindersBindNativeDialog', 'HomeRemindersBindMainDialog', 'HomeRemindersOnDialog', 'HomeRemindersClearOutcome', 'HomeRemindersDispose']
      .map(name => production(name, 'remB22Create')).join('\n'), e.ctx);
    e.ctx.HomeRemindersBindMainDialog(); expect(e.options.onDialog).not.toHaveBeenCalled();
    e.ctx.root.open = true; e.ctx.HomeRemindersBindMainDialog(); e.ctx.HomeRemindersBindMainDialog();
    expect(e.options.onDialog).toHaveBeenCalledExactlyOnceWith(e.ctx.root, { kind: 'main' });
    const child = {};
    e.ctx.HomeRemindersOnDialog(child);
    expect(e.options.onDialog).toHaveBeenLastCalledWith(child, { kind: 'outcome' });
    e.ctx.HomeRemindersDispose();
    expect(mainStop).toHaveBeenCalledOnce(); expect(childStop).toHaveBeenCalledOnce();
    expect(e.ctx.HomeRemindersOutcomeCleanup).toBeNull(); expect(e.ctx.HomeRemindersMainCleanup).toBeNull();
    e.state.current = false; expect(e.ctx.HomeRemindersBindNativeDialog({}, { kind: 'care' })).toBeNull();
    expect(e.options.onDialog).toHaveBeenCalledTimes(2);
  });
});

describe('selected-patient reminders refuse a mixed application update', () => {
  const refreshMessage = 'Odśwież całą kartę przeglądarki, aby dokończyć aktualizację aplikacji.';
  function requestEnvironment() {
    const topCall = vi.fn(() => 'top-scoped-result'), localCall = vi.fn(), alert = vi.fn();
    const target = { __VILDA_HOME_WORKSPACE_PREVIEW__: true,
      VildaAuthUI: { maybeShowReminders: topCall, disposeHomeReminders: vi.fn() },
      VildaHomeRemindersPresentation: { decorate() {} } };
    const win = { top: target, alert, VildaAuthUI: { maybeShowReminders: localCall } };
    const context = vm.createContext({ i: win });
    vm.runInContext(production('remB22Request'), context);
    return { context, target, topCall, localCall, alert };
  }

  it.each(['old-auth', 'missing-presenter', 'missing-decorator', 'disabled-preview'])('never forwards a selected patient to %s or falls back to the local/global opener', capability => {
    const e = requestEnvironment(), patientContext = { current: () => true };
    if (capability === 'old-auth') delete e.target.VildaAuthUI.disposeHomeReminders;
    if (capability === 'missing-presenter') delete e.target.VildaHomeRemindersPresentation;
    if (capability === 'missing-decorator') e.target.VildaHomeRemindersPresentation = {};
    if (capability === 'disabled-preview') e.target.__VILDA_HOME_WORKSPACE_PREVIEW__ = false;
    expect(e.context.remB22Request({ homePresentation: true, homeContext: patientContext })).toBe(false);
    expect(e.topCall).not.toHaveBeenCalled(); expect(e.localCall).not.toHaveBeenCalled();
    expect(e.alert).toHaveBeenCalledExactlyOnceWith(refreshMessage);
  });

  it('forwards the same immutable patient context only to a compatible top shell', () => {
    const e = requestEnvironment(), patientContext = { current: () => true }, request = { homePresentation: true, homeContext: patientContext, history: true };
    expect(e.context.remB22Request(request)).toBe('top-scoped-result');
    expect(e.topCall).toHaveBeenCalledExactlyOnceWith({ force: true, homePresentation: true, homeContext: patientContext, history: true });
    expect(e.topCall.mock.calls[0][0].homeContext).toBe(patientContext);
    expect(request).toEqual({ homePresentation: true, homeContext: patientContext, history: true });
    expect(e.localCall).not.toHaveBeenCalled(); expect(e.alert).not.toHaveBeenCalled();
  });

  it('keeps a global request compatible with the existing top opener during an update', () => {
    const e = requestEnvironment(); delete e.target.VildaAuthUI.disposeHomeReminders;
    delete e.target.VildaHomeRemindersPresentation; delete e.target.__VILDA_HOME_WORKSPACE_PREVIEW__;
    expect(e.context.remB22Request({ history: true })).toBe('top-scoped-result');
    expect(e.topCall).toHaveBeenCalledExactlyOnceWith({ force: true, history: true });
    expect(e.alert).not.toHaveBeenCalled();
  });

  it.each(['missing-presenter', 'disabled-preview', 'missing-request-flag', 'expired-context'])('rejects a direct scoped native open and read before any work for %s', failure => {
    const e = base(), patientContext = { current: () => failure !== 'expired-context' };
    if (failure === 'missing-presenter') delete e.ctx.i.VildaHomeRemindersPresentation;
    if (failure === 'disabled-preview') e.ctx.i.__VILDA_HOME_WORKSPACE_PREVIEW__ = false;
    const options = { force: true, homePresentation: failure !== 'missing-request-flag', homeContext: patientContext };
    Object.assign(e.ctx, { al: vi.fn(), jt: vi.fn(), wn: vi.fn(), remB22Create: vi.fn(),
      remSearchDropReturn: vi.fn(), remShowReadError: vi.fn() });
    vm.runInContext(production('remB22Open') + '\n' + production('tn'), e.ctx);
    expect(e.ctx.remB22Open([], options)).toBeNull();
    expect(e.ctx.al).not.toHaveBeenCalled(); expect(e.ctx.remB22Create).not.toHaveBeenCalled();
    return e.ctx.tn(options).then(result => {
      expect(result).toBe(false); expect(e.ctx.jt).not.toHaveBeenCalled(); expect(e.ctx.wn).not.toHaveBeenCalled();
      expect(e.ctx.remSearchDropReturn).not.toHaveBeenCalled(); expect(e.ctx.remShowReadError).not.toHaveBeenCalled();
    });
  });

  it('retains patient filtering independently of presentation availability and refuses a downgraded factory return', async () => {
    const e = base(), patientContext = { patientId: 'A', current: () => true };
    const declaration = source.split('\n').find(line => /^  var HomeRemindersContext =/.test(line));
    expect(declaration).toBeTruthy();
    Object.assign(e.ctx, { options: { homeContext: patientContext }, HomeRemindersRequested: false,
      vault: { listPatientNotesDueByDate: vi.fn().mockResolvedValue([]) }, remB22Request: vi.fn() });
    vm.runInContext(declaration + '\n' + production('remB22Flat') + '\n'
      + own.map(name => production(name, 'remB22Create')).join('\n') + '\n' + production('HomeRemindersRequest', 'remB22Create'), e.ctx);
    expect(e.ctx.HomeRemindersContext).toBe(patientContext);
    expect(e.ctx.HomeRemindersRows([group('A', [note('A', 'a')]), group('B', [note('B', 'b')])]).map(row => row.n.id)).toEqual(['a']);
    await e.ctx.HomeRemindersReadGroups();
    expect(e.ctx.vault.listPatientNotesDueByDate).toHaveBeenCalledWith('9999-12-31T23:59:59.999Z');
    expect(e.ctx.HomeRemindersRequest({ history: true })).toBe(false);
    expect(e.ctx.remB22Request).not.toHaveBeenCalled();
  });
});
