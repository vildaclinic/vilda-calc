import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(new URL('../../vilda_summary_cards.js', import.meta.url), 'utf8');
function setup() {
  const doc = new EventTarget(), timers = [];
  Object.assign(doc, { readyState: 'loading', getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] });
  const storage = new Map([['vildaCurrentPatientId', 'fictional-patient'], ['vildaPrevSummaryPid', 'fictional-patient'], ['vildaLoadChoiceV1', 'new']]);
  let ready = false, unlocked = true;
  const getPatient = vi.fn(async () => ({ snapshots: [] }));
  const win = new EventTarget();
  Object.assign(win, {
    document: doc,
    sessionStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    VildaAuthUI: { isBootReady: () => ready },
    VildaVault: { isUnlocked: () => unlocked, getPatient },
  });
  vm.runInNewContext(source, { window: win, document: doc, setTimeout: callback => timers.push(callback), clearTimeout() {} });
  return {
    win, getPatient,
    event: name => doc.dispatchEvent(new Event(name)),
    flush: () => { for (const callback of timers.splice(0)) callback(); },
    settle: () => { ready = true; doc.dispatchEvent(new Event('vilda:auth-boot-settled')); },
    lock: () => { unlocked = false; },
  };
}

describe('comparison startup reads use the completed native auth boundary', () => {
  it('does not read with a half-restored key and resumes once after auth settles', async () => {
    const h = setup();
    h.event('DOMContentLoaded'); h.flush();
    h.event('vilda:auth-hidden');
    h.win.__renderPrevSummary('fictional-patient');
    expect(h.getPatient).not.toHaveBeenCalled();
    h.settle();
    expect(h.getPatient).toHaveBeenCalledExactlyOnceWith('fictional-patient');
    await Promise.resolve();
    expect(h.win.VildaSummaryComparison.getState()).toMatchObject({ status: 'absent', pending: false });
  });
  it('does not restart a deferred comparison after the session locks', () => {
    const h = setup();
    h.event('DOMContentLoaded'); h.flush(); h.lock(); h.settle();
    expect(h.getPatient).not.toHaveBeenCalled();
  });
  it('retains immediate explicit reads after startup completes', () => {
    const h = setup(); h.settle(); h.getPatient.mockClear();
    h.win.__renderPrevSummary('fictional-patient', false, { source: 'pick' });
    expect(h.getPatient).toHaveBeenCalledExactlyOnceWith('fictional-patient');
  });
});
