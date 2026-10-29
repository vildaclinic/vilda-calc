import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

// Production delegation block; SSI owns canonical data/reference comparison.
// The shell must only choose a ready owner and mirror its public result.
const source = fs.readFileSync(new URL('../../vilda_shell.js', import.meta.url), 'utf8');
const block = source.slice(source.indexOf('/* P-CHIP-POWLOKA:'), source.indexOf('/* P-DOKUMENTY-PACJENTA:'));

function events(target = {}) {
  const listeners = new Map();
  target.addEventListener = (type, callback) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(callback);
  };
  target.removeEventListener = (type, callback) => listeners.get(type)?.delete(callback);
  target.dispatchEvent = event => {
    for (const callback of [...(listeners.get(event.type) || [])]) callback(event);
  };
  return target;
}

function chip() {
  const attributes = new Map();
  return {
    className: 'patient-chip',
    setAttribute: (key, value) => attributes.set(key, String(value)),
    getAttribute: key => attributes.get(key) ?? null,
    removeAttribute: key => attributes.delete(key),
  };
}

function harness() {
  const hostChip = chip(), storage = new Map([['vildaCurrentPatientId', 'fictional-a']]);
  const observers = [];
  let sessionAvailable = true;
  const host = events({
    sessionStorage: { getItem: key => storage.get(key) ?? null },
    VildaSession: { hasSessionKey: () => sessionAvailable, isGuestMode: () => false },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; this.target = null; this.disconnected = false; observers.push(this); }
      observe(target) { this.target = target; }
      disconnect() { this.disconnected = true; }
    },
  });
  const doc = { getElementById: id => id === 'vildaPatientChip' ? hostChip : null };
  function pane(route) {
    const ownChip = chip(), state = { ready: true, value: 'saved', savedAt: '2026-06-17', count: 4, name: 'Fikcyjny A', fp: 'fictional-reference' };
    const ownDoc = events({ getElementById: id => id === 'vildaPatientChip' ? ownChip : null });
    const api = {
      isReadyForSharedReference: vi.fn(() => state.ready),
      reconcileFromSharedReference: vi.fn(() => state.value),
      getState: vi.fn(() => state.value),
      getLastSavedAtISO: () => state.savedAt,
      getLastSnapshotCount: () => state.count,
      getLastPatientName: () => state.name,
      getReferenceFingerprint: () => state.fp,
      _buildTitleAttr: () => `${state.value}: ${state.name}, zapis ${state.count}`,
      _relativeTime: value => `relative: ${value}`,
      _forceTransition: vi.fn(),
    };
    const win = events({ document: ownDoc, VildaSaveStatusIndicator: api, stale: false });
    return { route, api, state, win, doc: ownDoc, chip: ownChip,
      entry: { loaded: true, stale: false, frame: { contentWindow: win, contentDocument: ownDoc, isConnected: true, hidden: route !== 'start' } } };
  }
  const start = pane('start'), docpro = pane('docpro'), klirens = pane('klirens');
  const panes = { start, docpro, klirens };
  const ctx = vm.createContext({ a: host, o: doc, c: 'start',
    l: Object.fromEntries(Object.entries(panes).map(([key, value]) => [key, value.entry])),
    Gp5_obcy: win => win.stale });
  vm.runInContext(block, ctx);
  return {
    ctx, host, hostChip, storage, start, docpro, klirens,
    refresh: () => ctx.ut(),
    mutation(pane) {
      for (const observer of observers) if (!observer.disconnected && observer.target === pane.chip) observer.callback([]);
    },
    changePatient(value) {
      value === null ? storage.delete('vildaCurrentPatientId') : storage.set('vildaCurrentPatientId', value);
      host.dispatchEvent({ type: 'storage', key: 'vildaCurrentPatientId' });
    },
    lock() {
      sessionAvailable = false;
      host.dispatchEvent({ type: 'storage', key: 'vilda-vault-session-v2' });
    },
  };
}

describe('shell delegates save status to a ready patient owner', () => {
  it.each(['terminarz', 'lab', 'homa', 'steroidy', 'notatki', 'ustawienia', 'edu', 'cukrzyca'])('%s keeps dirty status and metadata without a local SSI', route => {
    const h = harness();
    h.start.state.value = 'dirty';
    h.refresh();
    h.ctx.c = route;
    h.refresh();
    expect(h.ctx.Dt()).toBe(h.start.api);
    expect(h.hostChip.className).toContain('vilda-save-state--dirty');
    expect(h.hostChip.getAttribute('title')).toBe('dirty: Fikcyjny A, zapis 4');
    expect(h.ctx.Dt().getLastSnapshotCount()).toBe(4);
    for (const pane of [h.start, h.docpro, h.klirens]) expect(pane.api._forceTransition).not.toHaveBeenCalled();
  });

  it('prefers a ready active DocPro owner over the previously used Start', () => {
    const h = harness(); h.refresh();
    h.docpro.state.value = 'dirty'; h.docpro.state.count = 5;
    h.ctx.c = 'docpro'; h.refresh();
    expect(h.ctx.Dt()).toBe(h.docpro.api);
    expect(h.hostChip.getAttribute('title')).toBe('dirty: Fikcyjny A, zapis 5');
    expect(h.docpro.api.reconcileFromSharedReference).toHaveBeenCalledOnce();
  });

  it.each(['not-ready', 'loading', 'stale-entry', 'foreign-patient', 'detached', 'wrong-document'])('rejects an unsafe active source: %s', condition => {
    const h = harness();
    if (condition === 'not-ready') h.start.state.ready = false;
    if (condition === 'loading') h.start.entry.loaded = false;
    if (condition === 'stale-entry') h.start.entry.stale = true;
    if (condition === 'foreign-patient') h.start.win.stale = true;
    if (condition === 'detached') h.start.entry.frame.isConnected = false;
    if (condition === 'wrong-document') h.start.entry.frame.contentDocument = {};
    h.docpro.state.value = 'dirty'; h.refresh();
    expect(h.ctx.Dt()).toBe(h.docpro.api);
    expect(h.hostChip.className).toContain('vilda-save-state--dirty');
    expect(h.start.api.reconcileFromSharedReference).not.toHaveBeenCalled();
  });

  it('handles F5 on a passive route when the background Start becomes ready later', () => {
    const h = harness(); h.ctx.c = 'edu';
    for (const pane of [h.start, h.docpro, h.klirens]) pane.state.ready = false;
    h.refresh();
    expect(h.ctx.Dt()).toBeNull();
    h.start.state.ready = true; h.start.state.value = 'dirty';
    h.start.doc.dispatchEvent({ type: 'vilda:auth-boot-settled' });
    expect(h.ctx.Dt()).toBe(h.start.api);
    expect(h.hostChip.className).toContain('vilda-save-state--dirty');
  });

  it('adopts an active source after its publication becomes ready without another navigation', () => {
    const h = harness(); h.ctx.c = 'docpro'; h.docpro.state.ready = false;
    h.refresh(); expect(h.ctx.Dt()).toBe(h.start.api);
    h.docpro.state.ready = true; h.docpro.state.value = 'dirty';
    h.mutation(h.docpro);
    expect(h.ctx.Dt()).toBe(h.docpro.api);
    expect(h.hostChip.className).toContain('vilda-save-state--dirty');
  });

  it('same-patient restoration keeps a read-only snapshot while every owner is pending', () => {
    const h = harness(); h.start.state.value = 'dirty'; h.refresh();
    for (const pane of [h.start, h.docpro, h.klirens]) pane.state.ready = false;
    h.start.api.reconcileFromSharedReference.mockClear(); h.refresh();
    const snapshot = h.ctx.Dt();
    expect(snapshot).not.toBe(h.start.api);
    expect(snapshot.getState()).toBe('dirty');
    expect(snapshot.getLastSnapshotCount()).toBe(4);
    expect(snapshot._forceTransition).toBeUndefined();
    expect(h.hostChip.className).toContain('vilda-save-state--dirty');
    expect(h.start.api.reconcileFromSharedReference).not.toHaveBeenCalled();
  });

  it.each(['saving', 'error', 'new_patient'])('preserves the owner lifecycle state %s', state => {
    const h = harness(); h.start.state.value = state; h.refresh();
    h.ctx.c = 'notatki'; h.refresh();
    expect(h.ctx.Dt().getState()).toBe(state);
    expect(h.hostChip.className).toContain(`vilda-save-state--${state}`);
  });

  it('observer mirroring does not trigger another reconcile or write to hidden sources', () => {
    const h = harness(); h.refresh();
    h.start.api.reconcileFromSharedReference.mockClear();
    h.start.state.value = 'dirty'; h.mutation(h.start);
    expect(h.hostChip.className).toContain('vilda-save-state--dirty');
    expect(h.start.api.reconcileFromSharedReference).not.toHaveBeenCalled();
    expect(h.docpro.api.reconcileFromSharedReference).not.toHaveBeenCalled();
    expect(h.klirens.api.reconcileFromSharedReference).not.toHaveBeenCalled();
  });

  it('a reference update refreshes same-patient metadata through the public protocol', () => {
    const h = harness(); h.refresh(); h.ctx.c = 'homa';
    h.start.state.count = 6; h.start.state.savedAt = '2026-10-29';
    h.host.dispatchEvent({ type: 'storage', key: 'vilda-save-ref-v1' });
    expect(h.hostChip.getAttribute('title')).toBe('saved: Fikcyjny A, zapis 6');
    expect(h.ctx.Dt().getLastSavedAtISO()).toBe('2026-10-29');
  });

  it.each(['patient', 'clear', 'lock'])('%s immediately drops the previous patient status and pending snapshot', boundary => {
    const h = harness(); h.start.state.value = 'dirty'; h.refresh();
    for (const pane of [h.start, h.docpro, h.klirens]) pane.state.ready = false;
    if (boundary === 'patient') h.changePatient('fictional-b');
    if (boundary === 'clear') h.changePatient(null);
    if (boundary === 'lock') h.lock();
    expect(h.ctx.Dt()).toBeNull();
    expect(h.hostChip.className).not.toContain('vilda-save-state--');
    expect(h.hostChip.getAttribute('title')).toBeNull();
  });
});
