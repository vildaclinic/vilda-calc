import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync('docpro_state_persist.js', 'utf8');

// Fictional UI only. The full production controller runs with controlled timers;
// these tests do not copy its restore algorithm or any clinical calculation.
function harness({ saved = null, persistence = true, existingApi, domReady = false } = {}) {
  const tasks = [], writes = [], readyCallbacks = [], observers = [], documentEvents = [];
  let now = 0, nextId = 1;
  const details = { id: '', open: true };
  const schedule = (callback, delay = 0) => {
    const task = { id: nextId++, at: now + delay, callback, cancelled: false };
    tasks.push(task);
    return task.id;
  };
  const cancel = id => { const task = tasks.find(item => item.id === id); if (task) task.cancelled = true; };
  const doc = {
    body: {}, readyState: domReady ? 'loading' : 'complete',
    getElementById: () => null,
    querySelectorAll: selector => selector === 'details' ? [details] : [],
    addEventListener: (type, callback) => documentEvents.push({ type, callback }),
  };
  const win = {
    document: doc,
    VildaAuthUI: { isBootReady: () => true },
    __vildaPersistRestoring: false,
    sessionStorage: { getItem: () => 'fictional-docpro-owner' },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    addEventListener() {}, setTimeout: schedule,
  };
  if (!domReady) win.vildaOnReady = (_name, callback) => readyCallbacks.push(callback);
  if (existingApi) win.VildaDocproStatePersistence = existingApi;
  if (persistence) win.VildaPersistence = {
    readDocproUi: () => saved,
    writeDocproUi: value => writes.push(structuredClone(value)),
    clearLegacyDocproState() {},
  };
  class Observer {
    constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  class ClockDate extends Date { static now() { return now; } }
  new Function('window', 'document', 'MutationObserver', 'setTimeout', 'clearTimeout', 'Date', source)(
    win, doc, Observer, schedule, cancel, ClockDate,
  );
  function start() {
    const callback = domReady
      ? documentEvents.find(event => event.type === 'DOMContentLoaded')?.callback
      : readyCallbacks[0];
    callback?.();
  }
  function advanceTo(target) {
    for (;;) {
      const task = tasks.filter(item => !item.cancelled && item.at <= target)
        .sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!task) break;
      task.cancelled = true;
      now = task.at;
      task.callback();
    }
    now = target;
  }
  return {
    win, details, tasks, writes, observers, documentEvents, start, advanceTo,
    api: win.VildaDocproStatePersistence,
    mutate: () => observers.filter(observer => !observer.disconnected).forEach(observer => observer.callback()),
  };
}

function fictionalSavedUi() {
  return Object.freeze({
    version: 2,
    details: Object.freeze({ 'details:0': true }),
    controls: Object.freeze({}), buttonStates: Object.freeze({}),
    ui: Object.freeze({}), moduleStates: Object.freeze({}),
  });
}

describe('DocPro exposes its actual UI-restoration boundary without changing restoration', () => {
  it('publishes a read-only frozen API before the controller starts', () => {
    const h = harness();
    expect(Object.isFrozen(h.api)).toBe(true);
    expect(Object.getOwnPropertyDescriptor(h.win, 'VildaDocproStatePersistence')).toMatchObject({
      writable: false, configurable: false,
    });
    expect(() => { h.win.VildaDocproStatePersistence = {}; }).toThrow(TypeError);
    expect(() => { h.api.isReady = () => true; }).toThrow(TypeError);
    expect(h.api.isReady()).toBe(false);
    expect(h.api.isRestoring()).toBe(false);
    expect(h.tasks).toHaveLength(0);
    expect(h.writes).toEqual([]);
  });

  it('is ready immediately after binding when no saved UI exists', () => {
    const h = harness();
    h.start();
    expect(h.api.isRestoring()).toBe(false);
    expect(h.api.isReady()).toBe(true);
    expect(h.documentEvents.map(event => event.type)).toEqual([
      'input', 'change', 'toggle', 'click', 'visibilitychange',
    ]);
    expect(h.tasks).toHaveLength(0);
    expect(h.writes).toEqual([]);
  });

  it('does not confuse ready auth/main session with the still-running details restore', () => {
    const h = harness({ saved: fictionalSavedUi() });
    h.start();
    expect(h.win.VildaAuthUI.isBootReady()).toBe(true);
    expect(h.win.__vildaPersistRestoring).toBe(false);
    expect(h.api.isRestoring()).toBe(true);
    expect(h.api.isReady()).toBe(false);
    h.advanceTo(0);
    h.details.open = false;
    h.mutate();
    expect(h.details.open, 'existing production observer restores the same node').toBe(true);
    h.details.open = false;
    h.advanceTo(1400);
    expect(h.details.open, 'existing last details timer also restores the node').toBe(true);
    h.advanceTo(1849);
    expect(h.api.isReady()).toBe(false);
    expect(h.api.isRestoring()).toBe(true);
    expect(h.writes).toEqual([]);
    h.advanceTo(1850);
    expect(h.api.isReady()).toBe(true);
    expect(h.api.isRestoring()).toBe(false);
    expect(h.writes).toHaveLength(1);
    expect(h.writes[0]).toEqual({
      version: 2, savedAt: 1850, patientId: 'fictional-docpro-owner',
      controls: {}, details: { 'details:0': true }, buttonStates: {},
      ui: {
        endoListOpen: false, ghTestsOpen: false, ogttTestsOpen: false, acthTestsOpen: false,
        igfTherapyOpen: false, ghMonitorOpen: false, antibioticOpen: false, fluOpen: false,
        obesityOpen: false, hypertensionOpen: false, thyroidCancerKidsOpen: false,
        bisphosOpen: false, zscoreOpen: false, sgaBirthOpen: false,
      },
      moduleStates: {},
    });
    h.details.open = false;
    h.mutate();
    h.advanceTo(4000);
    expect(h.details.open, 'a user choice after readiness is not restored again').toBe(false);
    expect(h.writes).toHaveLength(1);
  });

  it('API reads neither mutate the saved payload nor schedule or save state', () => {
    const saved = fictionalSavedUi(), before = JSON.stringify(saved);
    const h = harness({ saved });
    h.start();
    const count = h.tasks.length;
    for (let index = 0; index < 10; index += 1) {
      expect(h.api.isReady()).toBe(false);
      expect(h.api.isRestoring()).toBe(true);
    }
    expect(h.tasks).toHaveLength(count);
    expect(h.writes).toEqual([]);
    expect(JSON.stringify(saved)).toBe(before);
  });

  it('also observes the DOMContentLoaded initialization path', () => {
    const h = harness({ domReady: true });
    expect(h.api.isReady()).toBe(false);
    h.start();
    expect(h.api.isReady()).toBe(true);
  });

  it('preserves a previously published global and otherwise keeps starting the controller', () => {
    const previous = Object.freeze({ fictionalExistingApi: true });
    const h = harness({ existingApi: previous });
    expect(h.api).toBe(previous);
    h.start();
    expect(h.documentEvents.some(event => event.type === 'toggle')).toBe(true);
  });

  it('keeps the existing no-persistence exit without a readiness API or side effects', () => {
    const h = harness({ persistence: false });
    expect(h.api).toBeUndefined();
    expect(h.tasks).toHaveLength(0);
    expect(h.documentEvents).toEqual([]);
  });
});
