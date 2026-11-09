import { describe, expect, it } from 'vitest';
import { appSrc, funkcjaZ, zrodlo } from '../support/silnik-bmi.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function harness() {
  const listeners = new Map();
  const fields = new Map();
  for (const id of ['dobInput', 'dobNote', 'dobError', 'dobClear', 'age', 'ageMonths', 'ageWeeks', 'ageWeeksRow', 'ageWeeksNote', 'ageWeeksError', 'restoreStateBtn']) {
    const local = new Map();
    fields.set(id, { id, value: '', readOnly: false, hidden: false, textContent: '', dataset: {}, style: {},
      classList: { toggle() {} }, focus() {},
      addEventListener(type, callback) { local.set(type, [...(local.get(type) || []), callback]); },
      dispatchEvent(event) { for (const callback of local.get(event.type) || []) callback(event); return true; },
    });
  }
  const timers = [];
  const win = { document: { readyState: 'complete', getElementById: id => fields.get(id) || null,
    addEventListener(type, callback) { listeners.set(type, [...(listeners.get(type) || []), callback]); },
    dispatchEvent(event) { for (const callback of listeners.get(event.type) || []) callback(event); return true; },
  }, Event: class { constructor(type) { this.type = type; } },
  CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
  setTimeout: callback => timers.push(callback), hasUserModifiedAfterLoad: false };
  loadBrowserScript('vilda_estimated_intake_runtime.js', win);
  loadBrowserScript('vilda_dob_age.js', win);
  const shouldSuspend = new Function('window', `${funkcjaZ(appSrc, 'shouldSuspendIntakeUserReset')};return shouldSuspendIntakeUserReset;`)(win);
  const calls = [];
  for (const id of ['age', 'ageMonths']) fields.get(id).addEventListener('input', () => {
    calls.push({ id, suspended: shouldSuspend() });
    if (!shouldSuspend()) win.VildaEstimatedIntakeRuntime.clearEstimatedIntakeWindowState();
  });
  const guard = new Function('w', 'dok', 'zgloc', `${funkcjaZ(zrodlo('vilda_dob_age.js'), 'bezZnaczaniaEdycji')};return bezZnaczaniaEdycji;`)(win, () => win.document, () => {});
  win.intakeHistory = [{ ageMonths: 150, height: 156.2, weight: 44.4 }]; win.intakeEstimatedKcalPerDay = 2362;
  return { win, fields, calls, guard, flush() { while (timers.length) timers.shift()(); } };
}

const birthday = () => `${new Date().getFullYear() - 13}-01-01`;
describe('DOB record/session replay does not erase its accepted intake history', () => {
  it('suspends the actual deferred record age input events only while replaying the record', () => {
    const h = harness(), before = structuredClone(h.win.intakeHistory);
    h.win.lastLoadedData = { user: { dobISO: birthday() } };
    h.win.document.dispatchEvent(new h.win.CustomEvent('vilda:state-restored'));
    h.flush();
    expect(h.calls.length).toBeGreaterThan(0); expect(h.calls.every(call => call.suspended)).toBe(true);
    expect(h.win.intakeHistory).toEqual(before); expect(h.win.intakeEstimatedKcalPerDay).toBe(2362);
    expect(h.win).not.toHaveProperty('__vildaSuspendIntakeUserReset');
  });

  it('also preserves actual setFromSession replay and still invalidates on a genuine manual DOB edit', () => {
    const h = harness(), before = structuredClone(h.win.intakeHistory);
    h.win.VildaDobAge.setFromSession(birthday(), { zRekordu: false });
    expect(h.win.intakeHistory).toEqual(before);
    expect(h.calls.every(call => call.suspended)).toBe(true);
    h.calls.length = 0;
    h.fields.get('dobInput').value = `${new Date().getFullYear() - 12}-01-01`;
    h.fields.get('dobInput').dispatchEvent(new h.win.Event('input'));
    expect(h.calls.length).toBeGreaterThan(0); expect(h.calls.every(call => !call.suspended)).toBe(true);
    expect(h.win.intakeHistory).toBeNull(); expect(h.win.intakeEstimatedKcalPerDay).toBeNull();
  });

  it.each([undefined, false, true, 'outer-restore'])('restores the exact prior guard %j after nested replay and a thrown callback', prior => {
    const h = harness(); if (prior !== undefined) h.win.__vildaSuspendIntakeUserReset = prior;
    const error = new Error('synthetic DOB callback failure');
    expect(() => h.guard(() => {
      expect(h.win.__vildaSuspendIntakeUserReset).toBe(true);
      h.guard(() => { expect(h.win.__vildaSuspendIntakeUserReset).toBe(true); });
      expect(h.win.__vildaSuspendIntakeUserReset).toBe(true); throw error;
    })).toThrow(error);
    if (prior === undefined) expect(h.win).not.toHaveProperty('__vildaSuspendIntakeUserReset');
    else expect(h.win.__vildaSuspendIntakeUserReset).toBe(prior);
  });
});
