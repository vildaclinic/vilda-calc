import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { funkcjaZ } from '../support/silnik-bmi.mjs';

const source = fs.readFileSync(new URL('../../vilda_shell.js', import.meta.url), 'utf8');
const block = source.slice(source.indexOf('/* Sidebar handoff is presentation only.'), source.indexOf('/* Menu actions follow the visible, ready form.'));
function events(object = {}) {
  const listeners = new Map();
  object.addEventListener = (type, fn) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); };
  object.removeEventListener = (type, fn) => listeners.get(type)?.delete(fn);
  object.dispatch = (type, detail = {}, isTrusted = false) => { for (const fn of [...(listeners.get(type) || [])]) fn({ type, detail, isTrusted }); };
  return object;
}
function button() {
  const attrs = new Map();
  return { disabled: false, getAttribute: key => attrs.get(key) ?? null, hasAttribute: key => attrs.has(key),
    setAttribute: (key, value) => attrs.set(key, String(value)), click: vi.fn() };
}
function account() {
  const state = { user: 'fictional-owner', key: 1, unlocked: true };
  const vault = { getCurrentUser: () => ({ userId: state.user }), isUnlocked: () => state.unlocked,
    captureSyncOperationSession: () => ({ key: state.key }),
    assertSyncOperationSession: token => { if (token.key !== state.key || !state.unlocked) throw Error('Old synthetic key'); } };
  return { state, vault };
}
function fixture() {
  const local = new Map([['vilda:sharedLoadSeq', 'fictional-tab:7']]);
  let patient = 'fictional-patient-a';
  const hostAccount = account(), clear = button();
  const host = { VildaVault: hostAccount.vault, localStorage: { getItem: key => local.get(key) ?? null } };
  const document = { querySelector: () => clear };
  function pane(route, loaded = true) {
    const auth = account(), save = button(), scope = {};
    const state = { ready: true, decision: 'saved', cached: 'saved', reference: 'fictional-reference-46', documents: 'ready', decisionCurrent: true, stale: false };
    const doc = events({ getElementById: id => id === 'saveDataBtnSidebar' ? save : null });
    const api = { getCurrentDecision: vi.fn(() => ({ ready: state.ready, state: state.decision, scope })),
      isCurrentDecisionOwner: value => value === scope && state.decisionCurrent,
      isReadyForSharedReference: () => state.ready, getState: vi.fn(() => state.cached),
      getReferenceFingerprint: () => state.reference,
      _buildTitleAttr: value => value + ': synthetic saved metadata' };
    const documents = { getState: () => ({ disabled: state.documents !== 'ready', busy: state.documents === 'busy' }),
      getReadinessPhase: () => state.documents };
    const win = events({ document: doc, VildaVault: auth.vault, VildaSaveStatusIndicator: api,
      VildaPatientDocuments: documents, VildaPanelPacjent: { nieaktualny: () => state.stale } });
    const frame = { contentWindow: win, contentDocument: doc, hidden: route !== 'start', isConnected: true };
    const entry = { frame, loaded, navigationGeneration: loaded ? 1 : 0, stale: false };
    return { route, auth, save, doc, api, documents, win, frame, entry, state };
  }
  const panes = { start: pane('start'), docpro: pane('docpro'), lab: pane('lab'), klirens: pane('klirens') };
  delete panes.lab.win.VildaSaveStatusIndicator;
  const ctx = vm.createContext({ a: host, o: document, c: 'start', l: Object.fromEntries(Object.entries(panes).map(([route, pane]) => [route, pane.entry])),
    Ss_patientId: () => patient, Gp5_obcy: win => win.VildaPanelPacjent.nieaktualny(), Promise });
  vm.runInContext(block, ctx);
  for (const pane of Object.values(panes)) ctx.Sp_bind(pane.entry);
  function navigate(route) {
    ctx.Sp_begin(route);
    panes[ctx.c].frame.hidden = true;
    ctx.c = route; panes[route].frame.hidden = false; ctx.Sp_target(panes[route].entry);
  }
  return { ctx, panes, host, hostAccount, clear, local, navigate, view: () => ctx.Sp_presentation(), setPatient: value => { patient = value; } };
}

describe('sidebar presentation: actual production handoff, without action authority', () => {
  it('uses a fresh readonly decision rather than the debounced Saved label', () => {
    const h = fixture(); h.panes.start.state.decision = 'dirty'; h.panes.docpro.state.ready = false;
    h.navigate('docpro');
    expect(h.view()).toEqual({ state: 'dirty', title: 'dirty: synthetic saved metadata', save: true, documents: true, clear: true });
    expect(h.panes.start.api.getCurrentDecision).toHaveBeenCalledOnce();
    expect(h.panes.start.api.getState).toHaveBeenCalledOnce();
    h.view(); h.view();
    expect(h.panes.start.api.getCurrentDecision).toHaveBeenCalledOnce();
    for (const p of Object.values(h.panes)) expect(p.save.click).not.toHaveBeenCalled();
    expect(h.clear.click).not.toHaveBeenCalled();
  });
  it.each(['saved', 'error'])('captures actual pending Saving with an unready live decision and follows native %s', outcome => {
    const h = fixture(), source = h.panes.start;
    let pending = true;
    source.state.ready = false; source.state.decision = 'hidden'; source.state.cached = 'saving';
    source.win.VildaDataImportExport = { isSaveUserDataPending: vi.fn(() => pending) };
    h.panes.docpro.state.ready = false; h.navigate('docpro');
    expect(h.view().state).toBe('saving');
    expect(source.win.VildaDataImportExport.isSaveUserDataPending).toHaveBeenCalledTimes(2);
    pending = false; source.state.ready = true; source.state.cached = outcome;
    h.ctx.Sp_sourceStatus(source.doc);
    expect(h.view().state).toBe(outcome);
    expect(source.api.getCurrentDecision).toHaveBeenCalledOnce();
    expect(source.save.click).not.toHaveBeenCalled();
  });
  it.each(['missing', 'not-current'])('never treats a stale Saving label as a pending operation: %s', proof => {
    const h = fixture(), source = h.panes.start;
    source.state.ready = false; source.state.decision = 'hidden'; source.state.cached = 'saving';
    if (proof === 'not-current') source.win.VildaDataImportExport = { isSaveUserDataPending: () => false };
    h.panes.docpro.state.ready = false; h.navigate('docpro');
    expect(h.view()).toBeNull();
  });

  it('retains a proven source Saving when the ready target still compares against the old reference', () => {
    const h = fixture(), source = h.panes.start, target = h.panes.docpro;
    source.state.ready = false; source.state.cached = 'saving';
    source.win.VildaDataImportExport = { isSaveUserDataPending: () => true };
    target.state.cached = target.state.decision = 'dirty';
    h.navigate('docpro'); source.state.ready = true;
    expect(h.view()).toMatchObject({ state: 'saving', save: null, documents: null, clear: null });
    expect(source.api.getCurrentDecision).toHaveBeenCalledOnce();
    expect(target.api.getCurrentDecision).not.toHaveBeenCalled();
    expect(source.save.click).not.toHaveBeenCalled(); expect(target.save.click).not.toHaveBeenCalled();
  });

  it('waits for native publication and exact reference adoption, then exposes genuine target Dirty', () => {
    const h = fixture(), source = h.panes.start, target = h.panes.docpro;
    let pending = true;
    source.state.ready = false; source.state.cached = 'saving';
    source.win.VildaDataImportExport = { isSaveUserDataPending: () => pending };
    target.state.cached = target.state.decision = 'dirty';
    h.navigate('docpro');
    pending = false; source.state.reference = 'fictional-reference-47';
    expect(h.view().state).toBe('saving');
    source.state.ready = true; source.state.cached = 'saved'; h.ctx.Sp_sourceStatus(source.doc);
    expect(h.view()).toMatchObject({ state: 'saving', title: 'saving: synthetic saved metadata' });
    target.state.reference = source.state.reference;
    expect(h.view().state).toBeNull();
    expect(target.state.cached).toBe('dirty');
    expect(source.api.getCurrentDecision).toHaveBeenCalledOnce();
    expect(source.state.reference).toBe('fictional-reference-47');
  });

  it('keeps the original pending operation through a ready intermediate route', () => {
    const h = fixture(), source = h.panes.start;
    source.state.ready = false; source.state.cached = 'saving';
    source.win.VildaDataImportExport = { isSaveUserDataPending: () => true };
    h.panes.docpro.state.cached = h.panes.docpro.state.decision = 'dirty';
    h.navigate('docpro'); h.navigate('lab');
    expect(h.view().state).toBe('saving');
    h.navigate('klirens'); expect(h.view().state).toBe('saving');
    expect(source.api.getCurrentDecision).toHaveBeenCalledOnce();
  });

  it('keeps reference adoption pending when the Save completes on a passive route', () => {
    const h = fixture(), source = h.panes.start, target = h.panes.docpro;
    let pending = true;
    source.state.ready = false; source.state.cached = 'saving';
    source.win.VildaDataImportExport = { isSaveUserDataPending: () => pending };
    h.navigate('lab'); expect(h.view().state).toBe('saving');
    pending = false; source.state.ready = true; source.state.cached = 'saved';
    source.state.reference = 'fictional-reference-47'; h.ctx.Sp_sourceStatus(source.doc);
    expect(h.view().state).toBe('saved');
    h.navigate('docpro');
    expect(h.view()).toMatchObject({ state: 'saving', title: 'saving: synthetic saved metadata' });
    target.state.reference = source.state.reference; target.state.cached = 'dirty';
    expect(h.view().state).toBeNull();
  });

  it.each(['input', 'change'])('a trusted target %s immediately retires a still-pending source Save', type => {
    const h = fixture(), source = h.panes.start;
    source.state.ready = false; source.state.cached = 'saving';
    source.win.VildaDataImportExport = { isSaveUserDataPending: () => true };
    h.navigate('docpro'); expect(h.view().state).toBe('saving');
    h.panes.docpro.doc.dispatch(type, {}, true);
    expect(h.view()).toBeNull();
  });

  it('preserves native Error, then permanently gives status to a verified new target Save', () => {
    const h = fixture(), source = h.panes.start, target = h.panes.docpro;
    let sourcePending = true, targetPending = false;
    source.state.ready = false; source.state.cached = 'saving';
    source.win.VildaDataImportExport = { isSaveUserDataPending: () => sourcePending };
    target.win.VildaDataImportExport = { isSaveUserDataPending: () => targetPending };
    h.navigate('docpro');
    sourcePending = false; source.state.ready = true; source.state.cached = 'error'; h.ctx.Sp_sourceStatus(source.doc);
    expect(h.view()).toMatchObject({ state: 'error', save: null, documents: null, clear: null });
    targetPending = true; target.state.ready = false; target.state.cached = 'saving';
    expect(h.view().state).toBeNull();
    targetPending = false;
    expect(h.view().state).toBeNull();
    source.state.cached = 'saved'; h.ctx.Sp_sourceStatus(source.doc);
    source.state.cached = 'error'; h.ctx.Sp_sourceStatus(source.doc);
    expect(h.view().state).toBeNull();
    target.state.ready = true; target.state.cached = 'dirty';
    expect(h.view().state).toBeNull();
  });

  it('releases a cancelled source Save to the target without waiting for Saved', () => {
    const h = fixture(), source = h.panes.start;
    let pending = true;
    source.state.ready = false; source.state.cached = 'saving';
    source.win.VildaDataImportExport = { isSaveUserDataPending: () => pending };
    h.navigate('docpro'); expect(h.view().state).toBe('saving');
    pending = false; source.state.ready = true; source.state.cached = 'dirty'; h.ctx.Sp_sourceStatus(source.doc);
    expect(h.view().state).toBeNull();
  });

  it('keeps a visible native Error, although the live comparison reports unsaved data', () => {
    const h = fixture(); h.panes.start.state.cached = 'error'; h.panes.start.state.decision = 'dirty';
    h.navigate('lab');
    expect(h.view().state).toBe('error');
  });
  it('ignores unchanged debounced Saved/title-only signals, but follows actual source state transitions', () => {
    const h = fixture(); h.panes.start.state.decision = 'dirty'; h.navigate('lab');
    h.ctx.Sp_sourceStatus(h.panes.start.doc, false);
    expect(h.view().state).toBe('dirty');
    h.panes.start.state.cached = 'saving'; h.ctx.Sp_sourceStatus(h.panes.start.doc, false);
    expect(h.view().state).toBe('saving');
    h.panes.start.state.cached = 'error'; h.ctx.Sp_sourceStatus(h.panes.start.doc, false);
    expect(h.view().state).toBe('error');
    expect(h.panes.start.api.getCurrentDecision).toHaveBeenCalledOnce();
  });
  it('keeps a verified same-visit own save and accepts its later native outcome without collecting hidden data', () => {
    const h = fixture(); h.panes.start.state.decision = 'dirty'; h.panes.start.state.cached = 'dirty'; h.navigate('lab');
    const receipt = { source: 'save', referenceVerified: true, patientId: 'fictional-patient-a', snapshotId: 'fictional-snapshot', applySequence: 4 };
    h.panes.start.win.VildaDataImportExport = { getCommittedSaveWitness: vi.fn(() => ({ patientId: receipt.patientId, sourcePatientId: receipt.patientId })) };
    h.panes.start.doc.dispatch('vilda:patient-loaded', receipt);
    expect(h.view().state).toBe('dirty');
    expect(h.panes.start.win.VildaDataImportExport.getCommittedSaveWitness).toHaveBeenCalledWith({ patientId: receipt.patientId, snapshotId: receipt.snapshotId, applySequence: 4 });
    h.panes.start.state.cached = 'saved'; h.ctx.Sp_sourceStatus(h.panes.start.doc, false);
    expect(h.view().state).toBe('saved');
    expect(h.panes.start.api.getCurrentDecision).toHaveBeenCalledOnce();
  });
  it('waits for native post-save publication instead of blessing the earlier Saved label', () => {
    const h = fixture(); h.panes.start.state.decision = 'dirty'; h.navigate('lab');
    h.panes.start.state.ready = false;
    h.panes.start.win.VildaDataImportExport = { getCommittedSaveWitness: () => ({ patientId: 'fictional-patient-a', sourcePatientId: 'fictional-patient-a' }) };
    h.panes.start.doc.dispatch('vilda:patient-loaded', { source: 'save', referenceVerified: true, patientId: 'fictional-patient-a', snapshotId: 'fictional-new', applySequence: 4 });
    expect(h.view().state).toBe('dirty');
    h.ctx.Sp_sourceStatus(h.panes.start.doc);
    expect(h.view().state).toBe('dirty');
    h.panes.start.state.ready = true;
    h.ctx.Sp_sourceStatus(h.panes.start.doc);
    expect(h.view().state).toBe('saved');
    expect(h.panes.start.api.getCurrentDecision).toHaveBeenCalledOnce();
  });

  it('rejects a same-PID save-shaped event without a current committed witness', () => {
    const h = fixture(); h.navigate('lab');
    h.panes.start.win.VildaDataImportExport = { getCommittedSaveWitness: () => null };
    h.panes.start.doc.dispatch('vilda:patient-loaded', { source: 'save', referenceVerified: true, patientId: 'fictional-patient-a', snapshotId: 'fictional-old', applySequence: 4 });
    expect(h.view()).toBeNull();
  });

  it('ends each pending projection when its current native owner becomes ready', () => {
    const h = fixture(); h.panes.docpro.state.ready = false; h.navigate('docpro');
    expect(h.view().save).toBe(true);
    h.panes.docpro.state.ready = true; h.panes.docpro.state.documents = 'preparing';
    expect(h.view()).toMatchObject({ state: null, save: null, clear: null, documents: true });
    h.panes.docpro.state.documents = 'unavailable';
    expect(h.view().documents).toBeNull();
  });
  it('retains truthful patient status on a passive route while actions are genuinely unavailable', () => {
    const h = fixture(); h.panes.start.state.decision = 'dirty'; h.navigate('lab');
    expect(h.view()).toMatchObject({ state: 'dirty', save: null, documents: null, clear: null });
    h.panes.docpro.state.ready = false; h.navigate('docpro');
    expect(h.view()).toMatchObject({ state: 'dirty', save: true, documents: true, clear: true });
  });
  it('observes the cold destination before exposing retained presentation and accepts only its first load', () => {
    const h = fixture(), target = h.panes.docpro;
    target.entry.loaded = false; target.entry.navigationGeneration = 0; target.state.ready = false;
    h.navigate('docpro'); expect(h.view().state).toBe('saved');
    target.entry.loaded = true; target.entry.navigationGeneration = 1;
    expect(h.view().state).toBe('saved');
    target.entry.navigationGeneration = 2;
    expect(h.view()).toBeNull();
  });
  it.each(['host-key', 'source-key', 'host-account', 'source-account', 'host-vault', 'source-vault', 'lock', 'guest', 'auth-guest', 'session-guest', 'logged-out', 'patient', 'same-pid-visit', 'source-document', 'target-document', 'source-stale', 'target-stale', 'target-entry-stale', 'target-account', 'target-key', 'target-detached'])('retires presentation on %s', change => {
    const h = fixture(); h.panes.docpro.state.ready = false; h.navigate('docpro');
    expect(h.view()).not.toBeNull();
    if (change === 'host-key') h.hostAccount.state.key++;
    if (change === 'source-key') h.panes.start.auth.state.key++;
    if (change === 'host-account') h.hostAccount.state.user = 'fictional-other';
    if (change === 'source-account') h.panes.start.auth.state.user = 'fictional-other';
    if (change === 'host-vault') h.host.VildaVault = account().vault;
    if (change === 'source-vault') h.panes.start.win.VildaVault = account().vault;
    if (change === 'lock') h.hostAccount.state.unlocked = false;
    if (change === 'guest') h.host.VildaGuestMode = true;
    if (change === 'auth-guest') h.host.VildaAuthUI = { isGuestMode: () => true };
    if (change === 'session-guest') h.panes.start.win.VildaSession = { isGuestMode: () => true };
    if (change === 'logged-out') h.host.VildaSession = { isLoggedIn: () => false };
    if (change === 'patient') h.setPatient('fictional-patient-b');
    if (change === 'same-pid-visit') h.local.set('vilda:sharedLoadSeq', 'fictional-tab:8');
    if (change === 'source-document') h.panes.start.frame.contentDocument = {};
    if (change === 'target-document') h.panes.docpro.frame.contentDocument = events({});
    if (change === 'source-stale') h.panes.start.state.stale = true;
    if (change === 'target-stale') h.panes.docpro.state.stale = true;
    if (change === 'target-entry-stale') h.panes.docpro.entry.stale = true;
    if (change === 'target-account') h.panes.docpro.auth.state.user = 'fictional-other';
    if (change === 'target-key') h.panes.docpro.auth.state.key++;
    if (change === 'target-detached') h.panes.docpro.frame.isConnected = false;
    expect(h.view()).toBeNull();
  });
  it.each(['vilda:patient-loaded', 'vilda:state-restored', 'vilda:json-imported', 'vilda:load-choice-applied', 'vilda:user-state-cleared', 'vilda:guest-mode-changed'])('retires on accepted %s before a new frame is ready', event => {
    const h = fixture(); h.panes.docpro.state.ready = false; h.navigate('docpro');
    h.panes.docpro.doc.dispatch(event);
    expect(h.view()).toBeNull();
  });
  it.each(['flag', 'auth-guest', 'session-guest', 'logged-out', 'locked'])('rejects a positively unavailable destination before its first account binding: %s', state => {
    const h = fixture(), target = h.panes.docpro;
    target.state.ready = false;
    if (state === 'flag') target.win.VildaGuestMode = true;
    if (state === 'auth-guest') target.win.VildaAuthUI = { isGuestMode: () => true };
    if (state === 'session-guest') target.win.VildaSession = { isGuestMode: () => true };
    if (state === 'logged-out') target.win.VildaSession = { isLoggedIn: () => false };
    if (state === 'locked') target.auth.state.unlocked = false;
    h.navigate('docpro');
    expect(h.view()).toBeNull();
  });

  it('allows unknown cold identity, then binds its first known same-account key', () => {
    const h = fixture(), target = h.panes.docpro, vault = target.win.VildaVault;
    delete target.win.VildaVault; target.win.VildaSession = { isLoggedIn: () => false };
    target.state.ready = false; h.navigate('docpro');
    expect(h.view().state).toBe('saved');
    target.win.VildaSession.isLoggedIn = () => true;
    target.win.VildaVault = vault; expect(h.view().state).toBe('saved');
    target.auth.state.key++;
    expect(h.view()).toBeNull();
  });

  it('keeps the original source through the exact native retirement/load, never the retired target as owner', () => {
    const h = fixture(), target = h.panes.docpro;
    target.state.ready = false; h.navigate('docpro'); target.state.stale = true;
    const intermediate = [];
    Object.assign(h.ctx, { Sw_blockDocument: vi.fn(), Dpd_invalidate: () => intermediate.push(h.view()), Sn_target: null,
      Dpd_mirror: () => intermediate.push(h.view()), z: vi.fn(), g: vi.fn(), B: vi.fn() });
    target.win.VildaPanelPacjent.utrwal = vi.fn(); target.win.location = { reload: vi.fn() };
    vm.runInContext(funkcjaZ(source, 'Gp5_przeladuj'), h.ctx);
    h.ctx.Gp5_przeladuj('docpro', target.entry, target.win);
    expect(intermediate.every(view => view?.state === 'saved')).toBe(true);
    expect(target.entry.loaded).toBe(false);
    expect(target.win.location.reload).toHaveBeenCalledOnce();
    expect(h.view().state).toBe('saved');
    const freshDoc = events({ getElementById: () => null });
    target.frame.contentDocument = freshDoc; target.win.document = freshDoc; target.state.stale = false;
    target.entry.navigationGeneration++; target.entry.loaded = true;
    expect(h.view().state).toBe('saved');
    target.frame.contentDocument = events({});
    expect(h.view()).toBeNull();
  });
  it('waits for actual auth boot before binding a cold key, then rejects later replacement', () => {
    const h = fixture(), target = h.panes.docpro;
    let bootReady = false, loggedIn = false;
    target.win.VildaAuthUI = { isBootReady: () => bootReady, isLoggedIn: () => loggedIn };
    target.auth.state.unlocked = false; target.state.ready = false; h.navigate('docpro');
    expect(h.view().state).toBe('saved');
    target.auth.state.unlocked = true; target.auth.state.key++;
    expect(h.view().state).toBe('saved');
    target.auth.state.key++; loggedIn = true; bootReady = true;
    expect(h.view().state).toBe('saved');
    target.auth.state.key++;
    expect(h.view()).toBeNull();
  });
  it.each(['foreign', 'guest'])('does not excuse a positive %s identity during auth boot', change => {
    const h = fixture(), target = h.panes.docpro;
    target.win.VildaAuthUI = { isBootReady: () => false };
    if (change === 'foreign') target.auth.state.user = 'fictional-other';
    else target.win.VildaGuestMode = true;
    target.state.ready = false; h.navigate('docpro');
    expect(h.view()).toBeNull();
  });

  it('the real explicit Reload retires presentation instead of adopting another target document', () => {
    const h = fixture(); h.panes.docpro.state.ready = false; h.navigate('docpro');
    Object.assign(h.ctx, { y: route => route, Dpd_invalidate: vi.fn(), Sn_focusTarget: null, Sn_target: null,
      Sn_cancelRequest: vi.fn(), Sn_auth: null, Sn_quietClose: vi.fn(), Sw_blockDocument: vi.fn(), Dpd_mirror: vi.fn(),
      d: { docpro: { src: 'docpro.html?embedded=1' } }, z: vi.fn(), g: vi.fn() });
    vm.runInContext(funkcjaZ(source, 'B'), h.ctx);
    h.ctx.B('docpro');
    expect(h.panes.docpro.entry.loaded).toBe(false);
    expect(h.view()).toBeNull();
  });

  it('does not authorize an ordinary document replacement via the native reload helper after an explicit visit change', () => {
    const h = fixture(), target = h.panes.docpro;
    target.state.ready = false; h.navigate('docpro');
    h.local.set('vilda:sharedLoadSeq', 'fictional-tab:8');
    h.ctx.Sp_restoreReload('docpro', target.entry);
    expect(h.view()).toBeNull();
  });
  it('auth bootstrap guest:false preserves the visit while live account fences still reject real guest mode', () => {
    const h = fixture(); h.panes.docpro.state.ready = false; h.navigate('docpro');
    h.panes.docpro.doc.dispatch('vilda:guest-mode-changed', { guest: false });
    expect(h.view().state).toBe('saved');
    h.panes.docpro.win.VildaGuestMode = true;
    h.panes.docpro.doc.dispatch('vilda:guest-mode-changed', { guest: false });
    expect(h.view()).toBeNull();
  });

  it('does not resurrect the projection after A→B→A once a mismatched identity was observed', () => {
    const h = fixture(); h.panes.docpro.state.ready = false; h.navigate('docpro');
    h.setPatient('fictional-patient-b'); expect(h.view()).toBeNull();
    h.setPatient('fictional-patient-a'); expect(h.view()).toBeNull();
  });
  it.each(['input', 'change'])('a genuine %s invalidates; replay and ordinary session restores do not', event => {
    const h = fixture(); h.panes.docpro.state.ready = false; h.navigate('docpro');
    h.panes.docpro.doc.dispatch(event);
    for (const type of ['vilda:persist-restored', 'vilda:main-session-restored', 'vilda:dob-restored']) h.panes.docpro.doc.dispatch(type);
    expect(h.view().state).toBe('saved');
    h.panes.docpro.doc.dispatch(event, {}, true);
    expect(h.view()).toBeNull();
  });
  it('an explicit clinical edit invalidates without an input event', () => {
    const h = fixture(); h.panes.docpro.state.ready = false; h.navigate('docpro');
    h.panes.docpro.doc.dispatch('vilda:puberty-assessment-changed', { reason: 'edit' });
    expect(h.view()).toBeNull();
  });
  it('does not retain old Saved when the new ready source is empty', () => {
    const h = fixture(); h.panes.docpro.state.ready = false; h.navigate('docpro');
    h.panes.docpro.state.ready = true; h.panes.docpro.state.decision = 'hidden';
    h.navigate('start'); expect(h.view()).toBeNull();
  });
  it('requires real key-session and fresh decision APIs instead of an identity-only fallback', () => {
    const h = fixture(); delete h.host.VildaVault.captureSyncOperationSession;
    h.panes.docpro.state.ready = false; h.navigate('docpro'); expect(h.view()).toBeNull();
  });
  it('detaches old document boundary listeners on replacement', () => {
    const h = fixture(), old = h.panes.lab.doc, replacement = events({});
    h.panes.lab.frame.contentDocument = replacement; h.panes.lab.win.document = replacement;
    h.ctx.Sp_bind(h.panes.lab.entry);
    h.panes.docpro.state.ready = false; h.navigate('docpro');
    old.dispatch('vilda:user-state-cleared'); expect(h.view().state).toBe('saved');
    replacement.dispatch('vilda:user-state-cleared'); expect(h.view()).toBeNull();
  });
});
