import { describe, expect, it, vi } from 'vitest';
import { setImmediate as settle } from 'node:timers/promises';
import { powloka } from '../support/powloka-harness.mjs';
import {
  authDeferred, authProductionFunction, authProductionReturnProgram,
  authProductionSource, authReturnEnvironment,
} from '../support/search-return-auth-harness.mjs';

const source = authProductionSource();
const program = authProductionReturnProgram(source);
const historyProgram = source.slice(source.indexOf('var mr=!1'), source.indexOf('// Rata D (P1+P4)'));
const historyListeners = source.slice(source.indexOf('function Ia(){'), source.indexOf('function ti(', source.indexOf('function Ia(){')));
const snapshot = () => ({ version: 1, query: 'Fikcyjny powrót', time: 'future', status: 'open',
  id: 'note:fictional-return-note', limit: 100, mode: 'detail', listScrollTop: 745, detailScrollTop: 1200,
  focus: null, origin: null });
const patientId = 'fictional-return-patient';
function environment(script = program, bindings = {}) {
  const open = vi.fn(async () => true);
  const fixture = authReturnEnvironment(script + '\n' + authProductionFunction(source, '$t')
    + '\n' + authProductionFunction(source, 'bn'), {
    carePatientMount: null, GdAnulujRender: vi.fn(), le: {}, Rt: null, xa: null,
    ee: [], ge: [], Qn: vi.fn(), sn: false, pr: vi.fn(), oe: vi.fn(),
    tn: open, ...bindings,
  }, source);
  return { ...fixture, open };
}

function productionReopenEnvironment() {
  const mounted = vi.fn();
  const e = environment(program + '\n' + authProductionFunction(source, 'tn'), {
    remMaybeReadSequence: 0, remMaybeForced: null, Fa: () => '2026-11-01', wn: vi.fn(),
    remB22Open: vi.fn(), Mr: mounted, ol: vi.fn(), remShowReadError: vi.fn(),
  });
  const actualReopen = e.context.tn;
  e.open.mockImplementation((...args) => actualReopen(...args)); e.context.tn = e.open;
  e.vault.listPatientNotesDueByDate = vi.fn(async () => [{ patientId, notes: [] }]);
  return { ...e, mounted };
}

describe('production AuthUI Search return ticket lifecycle', () => {
  it('creates an opaque return ticket and resumes the saved Search once', async () => {
    const e = environment(), context = snapshot();
    const token = e.context.remSearchCreateReturn(context, patientId);
    expect(typeof token).toBe('string'); expect(token).not.toContain(context.query);
    expect(e.context.remSearchCurrentReturn(token)).not.toBeNull();
    expect(await e.context.remSearchResume(token)).toBe(true);
    expect(e.open).toHaveBeenCalledTimes(1);
    expect(e.open).toHaveBeenCalledWith(expect.objectContaining({ force: true, globalSearch: context,
      _searchReturnGeneration: expect.any(Number) }));
    expect(await e.context.remSearchResume(token)).toBe(false);
    expect(e.open).toHaveBeenCalledTimes(1);
  });

  it('binds nested patient navigation only to the patient belonging to the active ticket', () => {
    const e = environment(), token = e.context.remSearchCreateReturn(snapshot(), patientId);
    expect(e.context.remSearchPatientReturn(patientId)).toBe(token);
    expect(e.context.remSearchPatientReturn('another-fictional-patient')).toBeNull();
    e.context.remSearchDropReturn();
    expect(e.context.remSearchPatientReturn(patientId)).toBeNull();
  });

  it.each([null, patientId])('an unrelated background card refresh preserves a pending ticket with patientId=%j', async destination => {
    const e = environment(), token = e.context.remSearchCreateReturn(snapshot(), destination);
    expect(e.context.remSearchPatientReturn('fictional-background-patient', true)).toBeNull();
    expect(e.context.remSearchCurrentReturn(token)).not.toBeNull();
    expect(await e.context.remSearchResume(token)).toBe(true);
    expect(e.open).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ globalSearch: snapshot() }));
  });

  it.each([
    [{ kind: 'plan', planId: 'fictional-plan', recordId: 'fictional-plan-record' },
      { carePlans: true, planId: 'fictional-plan', careRecordId: 'fictional-plan-record' }],
    [{ kind: 'matter', noteId: 'fictional-matter' }, { noteId: 'fictional-matter' }],
  ])('restores the immediate %j parent while retaining its Search origin', async (parent, destination) => {
    const e = environment(), expectedParent = { ...parent };
    const token = e.context.remSearchCreateReturn(snapshot(), patientId, parent);
    Object.assign(parent, { planId: 'changed-plan', recordId: 'changed-record', noteId: 'changed-note' });
    expect(e.context.remSearchCurrentReturn(token).parent).toEqual(expectedParent);
    expect(await e.context.remSearchResume(token)).toBe(true);
    expect(e.open).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      force: true, globalSearch: null, searchContext: snapshot(), ...destination,
    }));
  });

  it('drops a ticket explicitly without reopening Search', async () => {
    const e = environment(), token = e.context.remSearchCreateReturn(snapshot(), patientId);
    e.context.remSearchDropReturn();
    expect(e.context.remSearchCurrentReturn(token)).toBeNull();
    expect(await e.context.remSearchResume(token)).toBe(false);
    expect(e.open).not.toHaveBeenCalled();
  });

  it('a newer origin supersedes an older target callback', async () => {
    const e = environment();
    const older = e.context.remSearchCreateReturn(snapshot(), patientId);
    const newer = e.context.remSearchCreateReturn({ ...snapshot(), query: 'Nowszy fikcyjny powrót' }, patientId);
    expect(newer).not.toBe(older);
    expect(await e.context.remSearchResume(older)).toBe(false);
    expect(e.open).not.toHaveBeenCalled();
    expect(await e.context.remSearchResume(newer)).toBe(true);
    expect(e.open).toHaveBeenCalledTimes(1);
  });

  it('consumes the ticket before awaiting Search so double callbacks cannot open two surfaces', async () => {
    const waiting = authDeferred(), e = environment(); e.open.mockImplementationOnce(() => waiting.promise);
    const token = e.context.remSearchCreateReturn(snapshot(), patientId);
    const first = e.context.remSearchResume(token);
    expect(e.context.remSearchCurrentReturn(token)).toBeNull();
    expect(await e.context.remSearchResume(token)).toBe(false);
    expect(e.open).toHaveBeenCalledTimes(1);
    expect(e.open.mock.calls[0][0]._searchReturnCurrent()).toBe(true);
    waiting.resolve(true); expect(await first).toBe(true);
  });

  it('retains only the bounded UI context instead of result records or clinical bodies', async () => {
    const e = environment(), context = { ...snapshot(), rows: [{ body: 'Fikcyjna treść kliniczna' }],
      source: { noteId: 'fictional-source-note' }, body: 'Fikcyjny pełny opis' };
    const token = e.context.remSearchCreateReturn(context, patientId);
    context.query = 'Zmienione po utworzeniu biletu';
    expect(await e.context.remSearchResume(token)).toBe(true);
    const restored = e.open.mock.calls[0][0].globalSearch;
    expect(restored).toEqual(snapshot());
    expect(restored).not.toHaveProperty('rows'); expect(restored).not.toHaveProperty('source');
    expect(restored).not.toHaveProperty('body');
  });

  it.each(['lock', 'same-user-unlock', 'different-user', 'different-vault'])('rejects the old ticket across a %s boundary', async boundary => {
    const e = environment(), token = e.context.remSearchCreateReturn(snapshot(), patientId);
    if (boundary === 'lock') e.lock();
    if (boundary === 'same-user-unlock') { e.lock(); e.unlock(); }
    if (boundary === 'different-user') e.state.userId = 'other-fictional-account';
    if (boundary === 'different-vault') e.replaceVault();
    expect(e.context.remSearchCurrentReturn(token)).toBeNull();
    expect(await e.context.remSearchResume(token)).toBe(false);
    expect(e.open).not.toHaveBeenCalled();
  });

  it('a discarded pending resume cannot claim success after shell navigation', async () => {
    const waiting = authDeferred(), e = productionReopenEnvironment();
    e.vault.listPatientNotesDueByDate.mockImplementationOnce(() => waiting.promise);
    const token = e.context.remSearchCreateReturn(snapshot(), patientId);
    const pending = e.context.remSearchResume(token);
    e.context.remSearchDropReturn();
    waiting.resolve([{ patientId, notes: [] }]);
    expect(await pending).toBe(false);
    expect(e.context.remSearchCurrentReturn(token)).toBeNull();
    expect(e.mounted).not.toHaveBeenCalled();
  });

  it('completion of an old resume does not consume the ticket belonging to a newer origin', async () => {
    const waiting = authDeferred(), e = productionReopenEnvironment();
    e.vault.listPatientNotesDueByDate.mockImplementationOnce(() => waiting.promise);
    const older = e.context.remSearchCreateReturn(snapshot(), patientId);
    const pending = e.context.remSearchResume(older);
    const newer = e.context.remSearchCreateReturn({ ...snapshot(), id: 'note:fictional-newer-note' }, patientId);
    waiting.resolve([{ patientId, notes: [] }]); expect(await pending).toBe(false);
    expect(e.mounted).not.toHaveBeenCalled();
    expect(e.context.remSearchCurrentReturn(newer)).not.toBeNull();
    expect(await e.context.remSearchResume(newer)).toBe(true);
  });

  it('a rejected stale resume cannot show a read error over a newer shell route', async () => {
    const waiting = authDeferred(), e = productionReopenEnvironment();
    e.vault.listPatientNotesDueByDate.mockImplementationOnce(() => waiting.promise);
    const token = e.context.remSearchCreateReturn(snapshot(), patientId);
    const pending = e.context.remSearchResume(token);
    e.context.remSearchDropReturn();
    waiting.reject(new Error('FICTIONAL_STALE_RETURN_READ_FAILURE'));
    expect(await pending).toBe(false);
    expect(e.context.remShowReadError).not.toHaveBeenCalled();
    expect(e.mounted).not.toHaveBeenCalled();
  });

  it('a current rejected resume still shows its recoverable read error', async () => {
    const e = productionReopenEnvironment();
    e.vault.listPatientNotesDueByDate.mockRejectedValueOnce(new Error('FICTIONAL_CURRENT_RETURN_READ_FAILURE'));
    const token = e.context.remSearchCreateReturn(snapshot(), patientId);
    expect(await e.context.remSearchResume(token)).toBe(false);
    expect(e.context.remShowReadError).toHaveBeenCalledOnce();
    expect(e.mounted).not.toHaveBeenCalled();
  });

  it.each(['resolve-false', 'reject'])('returns failure when reopening Search %s', async outcome => {
    const e = environment();
    if (outcome === 'reject') e.open.mockRejectedValueOnce(new Error('FICTIONAL_RETURN_READ_FAILURE'));
    else e.open.mockResolvedValueOnce(false);
    const token = e.context.remSearchCreateReturn(snapshot(), patientId);
    expect(await e.context.remSearchResume(token)).toBe(false);
    expect(await e.context.remSearchResume(token)).toBe(false);
    expect(e.open).toHaveBeenCalledTimes(1);
  });
});

describe('production AuthUI hide discards Search return instead of resuming it', () => {
  it.each([undefined, { shellNavigation: true }])('invalidates a target callback after hide(%j)', async options => {
    const quietHistory = vi.fn();
    const e = environment(program + '\n' + authProductionFunction(source, '$t'), {
      carePatientMount: null, GdAnulujRender: vi.fn(), le: {},
      Rt: { style: {}, removeAttribute() {} }, xa: null, ee: [], ge: [], Qn: quietHistory,
      sn: false, pr: vi.fn(), oe: vi.fn(),
    });
    const token = e.context.remSearchCreateReturn(snapshot(), patientId);
    e.context.$t(options);
    expect(await e.context.remSearchResume(token)).toBe(false);
    expect(e.open).not.toHaveBeenCalled();
    expect(quietHistory).toHaveBeenCalledWith(options?.shellNavigation ? { quiet: true } : null);
  });

  it('shell navigation quietly hides both the top workspace and the outgoing iframe', async () => {
    const e = environment(), workspaceClose = vi.fn(() => { e.context.remB22Full = null; });
    const topClose = vi.fn(() => e.context.remSearchLeaveRoute()), unrelatedHide = vi.fn();
    const h = powloka(undefined, win => { win.VildaAuthUI = { closeSearchNavigation: topClose, hide: unrelatedHide }; });
    h.shell.navigate('start'); const frame = h.load('start');
    topClose.mockClear(); frame.contentWindow.VildaAuthUI.hide.mockClear();
    e.context.remB22Full = { close: workspaceClose };
    const token = e.context.remSearchCreateReturn(snapshot(), patientId);
    h.shell.navigate('docpro');
    expect(topClose).toHaveBeenCalled();
    expect(unrelatedHide).not.toHaveBeenCalled();
    expect(e.context.GdAnulujRender).toHaveBeenCalledOnce();
    expect(frame.contentWindow.VildaAuthUI.hide).toHaveBeenCalledWith({ shellNavigation: true });
    expect(workspaceClose).toHaveBeenCalledOnce();
    expect(await e.context.remSearchResume(token)).toBe(false);
    expect(e.open).not.toHaveBeenCalled();
    expect(h.history.back).not.toHaveBeenCalled();
  });

  it('leaving a route cancels a consumed pending Search resume without hiding unrelated top AuthUI', async () => {
    const waiting = authDeferred(), e = productionReopenEnvironment();
    e.context.Rt = { style: { display: 'block' }, removeAttribute() {} };
    e.vault.listPatientNotesDueByDate.mockImplementationOnce(() => waiting.promise);
    const token = e.context.remSearchCreateReturn(snapshot(), patientId);
    const pending = e.context.remSearchResume(token);
    expect(e.context.remSearchCurrentReturn(token)).toBeNull();
    e.context.Rt.style.display = 'block'; e.context.GdAnulujRender.mockClear();
    e.context.remSearchLeaveRoute();
    expect(e.context.GdAnulujRender).not.toHaveBeenCalled();
    expect(e.context.Rt.style.display).toBe('block');
    waiting.resolve([{ patientId, notes: [] }]);
    expect(await pending).toBe(false);
    expect(e.mounted).not.toHaveBeenCalled();
  });

  it('quiet standalone close removes only the auth sentinel without traversing native history', () => {
    const e = environment(program + '\n' + historyProgram);
    const state = { vildaNavSentinel: true, shellView: 'start', shellHref: '/index.html?fictional=1', other: 17 };
    e.win.parent = e.win;
    e.win.location = { href: 'https://fictional.invalid/index.html' };
    e.win.history = { state, replaceState: vi.fn(value => { e.win.history.state = value; }), back: vi.fn() };
    e.context.ye = true;
    e.context.Qn({ quiet: true });
    expect(e.win.history.replaceState).toHaveBeenCalledExactlyOnceWith({
      shellView: 'start', shellHref: '/index.html?fictional=1', other: 17,
    }, '', e.win.location.href);
    expect(e.context.ye).toBe(false);
    expect(e.win.history.back).not.toHaveBeenCalled();
  });
});

describe('production AuthUI rejects explicitly stale Search patient targets', () => {
  it.each(['se', 'ln'])('%s never starts reading or rendering a stale or mismatched ticket', async target => {
    const e = environment(program + '\n' + authProductionFunction(source, target), {
      Zt: vi.fn(), e: vi.fn(), Kt: vi.fn(), GdZacznijOdczyt: vi.fn(),
    });
    e.vault.getPatient = vi.fn();
    e.vault.listPatientNotesForPatient = vi.fn();
    const token = e.context.remSearchCreateReturn(snapshot(), patientId);
    const invoke = (id, returnToken) => target === 'se'
      ? e.context.se(id, null, null, { searchReturnToken: returnToken })
      : e.context.ln(id, { searchReturnToken: returnToken });
    await invoke('other-fictional-patient', token);
    expect(e.context.remSearchCurrentReturn(token)).not.toBeNull();
    e.context.remSearchDropReturn();
    await invoke(patientId, token);
    expect(e.vault.getPatient).not.toHaveBeenCalled();
    expect(e.vault.listPatientNotesForPatient).not.toHaveBeenCalled();
    expect(e.context.Zt).not.toHaveBeenCalled();
    expect(e.context.GdZacznijOdczyt).not.toHaveBeenCalled();
  });

  it('a new public navigation invalidates Search before invoking its destination', async () => {
    const e = environment(), action = vi.fn(() => 'destination');
    const token = e.context.remSearchCreateReturn(snapshot(), patientId);
    const navigate = e.context.remSearchNewNavigation(action);
    expect(navigate(patientId, { activeTab: 'notes' })).toBe('destination');
    expect(action).toHaveBeenCalledExactlyOnceWith(patientId, { activeTab: 'notes' });
    expect(await e.context.remSearchResume(token)).toBe(false);
    expect(e.open).not.toHaveBeenCalled();
  });

  it.each(['shell', 'hash', 'standalone'])('a GH route jump discards Search before navigating through %s', async route => {
    const e = environment(program + '\n' + authProductionFunction(source, 'Gr'));
    const token = e.context.remSearchCreateReturn(snapshot(), patientId), navigate = vi.fn(() => {
      expect(e.context.remSearchCurrentReturn(token)).toBeNull();
    });
    e.document.documentElement = { classList: { contains: () => route === 'shell' } };
    e.win.sessionStorage = { setItem: vi.fn() };
    e.win.parent = route === 'shell' ? { VildaShell: { navigate } } : e.win;
    e.win.location = route === 'hash'
      ? { get hash() { return ''; }, set hash(value) { navigate(value); } }
      : { set href(value) { navigate(value); } };
    if (route === 'hash') e.win.refreshGHTherapyMonitor = vi.fn();
    e.context.Gr(patientId, 'fictional-gh-point');
    expect(navigate).toHaveBeenCalledOnce();
    expect(await e.context.remSearchResume(token)).toBe(false);
    expect(e.open).not.toHaveBeenCalled();
  });
});

describe('production AuthUI Back reaches Search at the patient-card boundary', () => {
  it('a new public patient intent removes its expired Search boundary and preserves ordinary Back steps', async () => {
    const renderPatient = vi.fn();
    const e = environment(program + '\n' + historyProgram + '\n' + historyListeners, {
      Gd7: vi.fn(), Be: vi.fn(), ze: vi.fn(), se: renderPatient, ln: vi.fn(), fi: vi.fn(),
      Rt: { style: { display: 'block' }, querySelector: () => ({}), removeAttribute() {} },
    });
    e.win.navigator = { userAgent: 'UnitTest' }; e.win.matchMedia = () => ({ matches: false }); e.win.parent = e.win;
    e.win.history = { state: null, pushState: vi.fn(value => { e.win.history.state = value; }), back: vi.fn() };
    const token = e.context.remSearchCreateReturn(snapshot(), patientId);
    e.context.remSearchSeedReturn(token);
    e.context.ia({ screen: 'card', patientId, tab: 'notes' });
    const navigate = e.context.remSearchNewNavigation(id => e.context.ia({ screen: 'card', patientId: id, tab: 'notes' }));
    navigate('fictional-new-patient');
    expect(e.context.ee).toEqual([
      { screen: 'card', patientId, tab: 'notes' },
      { screen: 'card', patientId: 'fictional-new-patient', tab: 'notes' },
    ]);
    e.win.history.state = null; e.context.ye = true; e.context.Sn_authBack();
    expect(renderPatient).toHaveBeenCalledExactlyOnceWith(patientId, null, null, { activeTab: 'notes', _navRestore: true });
    e.win.history.state = null; e.context.ye = true; e.context.Sn_authBack();
    expect(e.context.ee).toEqual([]);
    expect(e.context.Rt.style.display).toBe('none');
    expect(await e.context.remSearchResume(token)).toBe(false);
    expect(e.open).not.toHaveBeenCalled();
  });

  it.each([false, true])('establishes the Search history boundary synchronously before an immediate Back (shell=%s)', async shellMode => {
    const e = environment(program + '\n' + historyProgram + '\n' + historyListeners, {
      Gd7: vi.fn(), Be: vi.fn(), ze: vi.fn(), se: vi.fn(), ln: vi.fn(), fi: vi.fn(),
      Rt: { style: { display: 'block' }, querySelector: () => ({}), removeAttribute() {} },
    });
    let shellCurrent = false, shellBack;
    const shell = { ensureAuthHistory: vi.fn((_win, callback) => { shellCurrent = true; shellBack = callback; return true; }),
      releaseAuthHistory: vi.fn(() => { shellCurrent = false; }), isAuthHistoryCurrent: () => shellCurrent };
    e.win.navigator = { userAgent: 'UnitTest' }; e.win.matchMedia = () => ({ matches: false });
    e.win.parent = shellMode ? { VildaShell: shell } : e.win;
    e.win.history = { state: null, pushState: vi.fn(value => { e.win.history.state = value; }), back: vi.fn() };
    const token = e.context.remSearchCreateReturn(snapshot(), patientId);
    e.context.remSearchSeedReturn(token);
    e.context.ia({ screen: 'card', patientId, tab: 'notes' });
    expect(e.pendingTimerCount()).toBe(0);
    if (shellMode) expect(shell.ensureAuthHistory).toHaveBeenCalled();
    else expect(e.win.history.pushState).toHaveBeenCalledExactlyOnceWith({ vildaNavSentinel: true }, '');
    if (shellMode) { shellCurrent = false; shellBack(); }
    else { e.win.history.state = null; e.win.dispatchEvent(new Event('popstate')); }
    await settle();
    expect(e.open).toHaveBeenCalledTimes(1);
    expect(e.open).toHaveBeenCalledWith(expect.objectContaining({ globalSearch: snapshot() }));
    if (shellMode) expect(e.win.history.pushState).not.toHaveBeenCalled();
  });

  it('keeps an internal patient tab step before consuming the Search origin', async () => {
    const restoreTab = vi.fn(), history = vi.fn(() => true);
    const e = environment(program + '\n' + authProductionFunction(source, 'zr')
      + '\n' + authProductionFunction(source, 'Sn_authBack')
      + '\n' + authProductionFunction(source, '$a'), {
      xn: 0, ye: true, ba: () => false, ge: [], le: {}, yr: () => false,
      Sn_shellHistory: () => ({ ensureAuthHistory: history }),
      Rt: { style: { display: 'block' }, querySelector: () => ({}), removeAttribute() {} },
      xa: { patientId, el: { isConnected: true }, restoreTab },
      se: vi.fn(), ln: vi.fn(), Be: vi.fn(), ze: vi.fn(), fi: vi.fn(), $t: vi.fn(),
    });
    const token = e.context.remSearchCreateReturn(snapshot(), patientId);
    e.context.ee = [{ screen: 'search', returnToken: token },
      { screen: 'card', patientId, tab: 'notes' }, { screen: 'card', patientId, tab: 'timeline' }];
    e.context.Sn_authBack(); await settle();
    expect(restoreTab).toHaveBeenCalledWith('notes');
    expect(e.open).not.toHaveBeenCalled();
    expect(e.context.remSearchCurrentReturn(token)).not.toBeNull();
    e.context.Sn_authBack(); await settle();
    expect(e.open).toHaveBeenCalledTimes(1);
    expect(e.open).toHaveBeenCalledWith(expect.objectContaining({ globalSearch: snapshot() }));
  });

  it.each([false, true])('Escape respects an existing child dialog before returning to Search (child=%s)', async childOpen => {
    const e = environment(), listeners = new Map();
    const token = e.context.remSearchCreateReturn(snapshot(), patientId);
    e.context.ee = [{ screen: 'search', returnToken: token }, { screen: 'card', patientId, tab: 'notes' }];
    e.context.ge = childOpen ? [vi.fn()] : [];
    const card = { addEventListener: (name, callback) => listeners.set(name, callback) };
    e.context.remSearchBindReturn(card, token);
    const event = { key: 'Escape', defaultPrevented: false, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    listeners.get('keydown')(event); await settle();
    expect(e.open).toHaveBeenCalledTimes(childOpen ? 0 : 1);
    expect(event.preventDefault).toHaveBeenCalledTimes(childOpen ? 0 : 1);
  });
});

function integrationEnvironment() {
  const sourceHost = { alive: true }, viewOptions = [];
  const close = vi.fn(() => { sourceHost.alive = false; });
  const patient = vi.fn(async () => true), external = vi.fn(async () => true), editor = vi.fn();
  const view = { getContext: () => snapshot(), setVisible: vi.fn(), request: vi.fn(), destroy: vi.fn() };
  const module = { mount: vi.fn((_host, options) => { viewOptions.push(options); return view; }) };
  let e, owner;
  e = environment(program + '\n' + authProductionFunction(source, 'openSearchPatient', 'remB22Create')
    + '\n' + authProductionFunction(source, 'mountGlobalSearch', 'remB22Create')
    + '\n' + authProductionFunction(source, 'closed', 'remB22Create')
    + '\n' + authProductionFunction(source, '$t'), {
    full: true, searchView: null, searchNavigation: null, globalSearchHost: {},
    state: { tab: 'search', editing: false, busy: false },
    alive: () => sourceHost.alive && e.current(owner), close,
    se: patient, ln: external, ga: editor,
    CareProtectNativeEditor: vi.fn(), privacy: null,
    remB22Request: vi.fn(), openCare: vi.fn(), enterDetail: vi.fn(), selectLinked: vi.fn(), ia: vi.fn(),
    Ia: vi.fn(), Sn_shellHistory: () => null, ba: () => false, ye: false,
    carePatientMount: null, GdAnulujRender: vi.fn(), le: {},
    Rt: { style: {}, removeAttribute() {} }, xa: null, ee: [], ge: [], Qn: vi.fn(),
    sn: false, pr: vi.fn(), oe: vi.fn(),
  });
  e.win.history = { state: null, pushState: vi.fn(), back: vi.fn() };
  owner = e.owner();
  e.context.vault = e.vault; e.win.VildaGlobalSearchView = module;
  e.vault.getPatientNote = vi.fn(async id => ({ id, patientId, title: 'Fikcyjny cel', category: 'followup' }));
  e.context.mountGlobalSearch();
  expect(viewOptions).toHaveLength(1);
  return { ...e, callbacks: viewOptions[0], close, patient, external, editor, sourceHost };
}

describe('production AuthUI Search target callbacks', () => {
  it.each([false, true])('opens the correct patient surface with a live origin ticket (external=%s)', async isExternal => {
    const e = integrationEnvironment();
    await e.callbacks.openPatient(patientId, 'fictional-return-note', { kind: 'note', patientId, isExternal });
    expect(e.close).toHaveBeenCalledTimes(1);
    expect(isExternal ? e.external : e.patient).toHaveBeenCalledTimes(1);
    expect(isExternal ? e.patient : e.external).not.toHaveBeenCalled();
    const token = e.context.remSearchPatientReturn(patientId);
    expect(typeof token).toBe('string');
    expect(e.context.remSearchCurrentReturn(token)).not.toBeNull();
    expect(e.open).not.toHaveBeenCalled();
  });

  it('a patient result uses an existing patient tab rather than the nonexistent status tab', async () => {
    const e = integrationEnvironment();
    await e.callbacks.openPatient(patientId, null, { kind: 'patient', patientId });
    expect(e.patient).toHaveBeenCalledTimes(1);
    expect(e.patient.mock.calls[0][3]?.activeTab).not.toBe('status');
  });

  it('returns to the original Search when opening the target patient fails', async () => {
    const e = integrationEnvironment(); e.patient.mockRejectedValueOnce(new Error('FICTIONAL_PATIENT_OPEN_FAILURE'));
    await e.callbacks.openPatient(patientId, 'fictional-return-note', { kind: 'note', patientId });
    expect(e.open).toHaveBeenCalledTimes(1);
    expect(e.open).toHaveBeenCalledWith(expect.objectContaining({ globalSearch: snapshot() }));
  });

  it('double patient navigation cannot open a second target while the first target is pending', async () => {
    const waiting = authDeferred(), e = integrationEnvironment(); e.patient.mockImplementationOnce(() => waiting.promise);
    const first = e.callbacks.openPatient(patientId, 'fictional-return-note', { kind: 'note', patientId });
    await e.callbacks.openPatient(patientId, 'fictional-return-note', { kind: 'note', patientId });
    expect(e.patient).toHaveBeenCalledTimes(1);
    expect(e.close).toHaveBeenCalledTimes(1);
    waiting.resolve(true); await first;
    expect(e.open).not.toHaveBeenCalled();
  });

  it('a late event read cannot open an editor after quiet shell navigation', async () => {
    const waiting = authDeferred(), e = integrationEnvironment(); e.vault.getPatientNote.mockImplementationOnce(() => waiting.promise);
    const pending = e.callbacks.openCalendar('fictional-return-note', { kind: 'event', patientId });
    e.context.$t({ shellNavigation: true });
    waiting.resolve({ id: 'fictional-return-note', patientId, title: 'Fikcyjny cel', category: 'followup' });
    await pending;
    expect(e.editor).not.toHaveBeenCalled();
    expect(e.open).not.toHaveBeenCalled();
  });

  it('explicit Close remains available during an event read and prevents its late editor', async () => {
    const waiting = authDeferred(), e = integrationEnvironment();
    e.vault.getPatientNote.mockImplementationOnce(() => waiting.promise);
    const pending = e.callbacks.openCalendar('fictional-return-note');
    expect(e.context.state.busy).toBe(false);
    e.context.closed();
    expect(e.close).toHaveBeenCalledOnce();
    waiting.resolve({ id: 'fictional-return-note', patientId, category: 'followup' });
    expect(await pending).toBe(false);
    expect(e.editor).not.toHaveBeenCalled();
    expect(e.open).not.toHaveBeenCalled();
  });

  it('changing the Search query cancels a pending event read before it opens an editor', async () => {
    const waiting = authDeferred(), e = integrationEnvironment();
    e.vault.getPatientNote.mockImplementationOnce(() => waiting.promise);
    const pending = e.callbacks.openCalendar('fictional-return-note');
    e.callbacks.onChange({ ...snapshot(), query: 'Nowsze fikcyjne zapytanie', mode: 'list', id: null });
    waiting.resolve({ id: 'fictional-return-note', patientId, category: 'followup' });
    expect(await pending).toBe(false);
    expect(e.editor).not.toHaveBeenCalled();
    expect(e.close).not.toHaveBeenCalled();
    expect(e.open).not.toHaveBeenCalled();
  });

  it('a hidden Search view update cannot cancel a pending care-plan navigation', () => {
    const e = integrationEnvironment(), token = e.context.remSearchCreateReturn(snapshot(), patientId);
    const navigation = { surface: 'plans', noteId: 'fictional-care-record', token };
    e.context.searchNavigation = navigation;
    e.callbacks.onChange({ ...snapshot(), mode: 'list', id: null });
    expect(e.context.searchNavigation).toBe(navigation);
    expect(e.context.remSearchCurrentReturn(token)).not.toBeNull();
  });

  it('the same event cannot start duplicate reads while its navigation is pending', async () => {
    const waiting = authDeferred(), e = integrationEnvironment();
    e.vault.getPatientNote.mockImplementationOnce(() => waiting.promise);
    const pending = e.callbacks.openCalendar('fictional-return-note');
    expect(await e.callbacks.openCalendar('fictional-return-note')).toBe(false);
    expect(e.vault.getPatientNote).toHaveBeenCalledExactlyOnceWith('fictional-return-note');
    waiting.resolve({ id: 'fictional-return-note', patientId, category: 'followup' });
    expect(await pending).toBe(true);
    expect(e.editor).toHaveBeenCalledOnce();
  });

  it('a background refresh of the underlying patient cannot cancel the pending event target or its return', async () => {
    const waiting = authDeferred(), e = integrationEnvironment();
    e.vault.getPatientNote.mockImplementationOnce(() => waiting.promise);
    const pending = e.callbacks.openCalendar('fictional-return-note', { kind: 'event', patientId });
    expect(e.context.remSearchPatientReturn('fictional-underlying-patient', true)).toBeNull();
    waiting.resolve({ id: 'fictional-return-note', patientId, title: 'Fikcyjny cel', category: 'followup' });
    expect(await pending).toBe(true);
    expect(e.editor).toHaveBeenCalledOnce();
    const editorCallbacks = e.editor.mock.calls[0][0];
    expect(await editorCallbacks.onCancel()).toBe(true);
    expect(await editorCallbacks.onSaved()).toBe(false);
    expect(e.open).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ globalSearch: snapshot() }));
  });

  it('a late event read cannot open a target after locking and unlocking the same account', async () => {
    const waiting = authDeferred(), e = integrationEnvironment(); e.vault.getPatientNote.mockImplementationOnce(() => waiting.promise);
    const pending = e.callbacks.openCalendar('fictional-return-note', { kind: 'event', patientId });
    e.lock(); e.unlock();
    waiting.resolve({ id: 'fictional-return-note', patientId, title: 'Fikcyjny cel', category: 'followup' });
    await pending;
    expect(e.editor).not.toHaveBeenCalled();
    expect(e.open).not.toHaveBeenCalled();
  });
});
