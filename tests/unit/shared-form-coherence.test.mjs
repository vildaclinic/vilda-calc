import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const owns = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function storage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}

// Actual adapter, runtime and userData listeners. Only the DOM/storage platform
// is modeled. A trusted fixture event represents a browser user edit; document
// capture runs before the target listener, unlike a flat listener-list mock.
async function harness({ missingFields = [], omitById = [] } = {}) {
  const fields = {}, listeners = {};
  const add = (map, type, callback, options) => {
    (map[type] ||= []).push({ callback, capture: options === true || options?.capture === true });
  };
  const invoke = (map, event, capture) => {
    for (const entry of map[event.type] || []) if (entry.capture === capture) entry.callback(event);
  };
  const document = {
    readyState: 'complete', hidden: false,
    addEventListener(type, callback, options) { add(listeners, type, callback, options); },
    dispatchEvent(event) { invoke(listeners, event, true); invoke(listeners, event, false); return true; },
    getElementById: id => fields[id] || null,
    getElementsByName: () => [], querySelectorAll: () => [],
  };
  function dispatch(field, original, trusted) {
    const event = { type: original.type, target: field, isTrusted: trusted, detail: original.detail };
    invoke(listeners, event, true);
    invoke(field.listeners, event, true);
    invoke(field.listeners, event, false);
    if (original.bubbles) invoke(listeners, event, false);
    return true;
  }
  for (const id of ['name', 'age', 'ageMonths', 'weight', 'height', 'sex']) {
    if (missingFields.includes(id)) continue;
    fields[id] = { id, tagName: id === 'sex' ? 'SELECT' : 'INPUT',
      type: ['name', 'sex'].includes(id) ? 'text' : 'number', value: '', dataset: {},
      disabled: false, listeners: {}, closest: () => null,
      addEventListener(type, callback, options) { add(this.listeners, type, callback, options); },
      dispatchEvent(event) { return dispatch(this, event, false); },
    };
  }
  const win = new EventTarget();
  Object.assign(win, { document, sessionStorage: storage(), localStorage: storage(),
    setTimeout, clearTimeout, Event, CustomEvent, vildaAppOnReady() {},
    VildaPanelPacjent: { nieaktualny: () => false },
  });
  win.sessionStorage.setItem('vildaCurrentPatientId', 'fictional-shared-form');
  const load = file => new Function('window', 'globalThis', 'document', source(file))(win, win, document);
  load('vilda_persistence_adapter.js');
  const initial = { name: 'Fikcyjna Osoba E2 D3', age: '30', ageMonths: '0',
    sex: 'F', weight: '60', height: '165', unrelated: { keep: 'root' },
    _vildaPersist: {
      byId: { age: '30', ageMonths: '0', sex: 'F', weight: '60', height: '165', absentControl: 'keep' },
      globals: { untouched: { keep: 'globals' } },
    } };
  for (const id of omitById) delete initial._vildaPersist.byId[id];
  win.VildaPersistence.writeShared(initial, { force: true });
  load('vilda_persist_runtime.js');
  win.VildaPersistRuntime.init();
  load('userData.js');
  win.vildaPersistRestoreAll();
  win.vildaPersistRestoreFinishNow();
  await vi.advanceTimersByTimeAsync(1000);
  expect(win.VildaPersistence.isRestoring()).toBe(false);
  expect(win.VildaPersistence.isAutosaveSuppressed()).toBe(false);
  return { win, fields,
    read: () => win.VildaPersistence.readShared(),
    edit(id, value) { fields[id].value = value; dispatch(fields[id], { type: 'input', bubbles: true }, true); },
    restore: () => win.vildaPersistRestoreAll(),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-17T13:00:00Z'));
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('shared form coherence before the persistence debounce', () => {
  it.each([
    ['years', [['age', '40']], '40', '0'],
    ['years and months', [['age', '12'], ['ageMonths', '7']], '12', '7'],
    ['empty years with reported months', [['age', ''], ['ageMonths', '5']], '', '5'],
    ['blank months preserve year precision', [['age', '40'], ['ageMonths', '']], '40', ''],
    ['zero years and months', [['age', '0'], ['ageMonths', '0']], '0', '0'],
  ])('%s survives an immediate production restore', async (_label, edits, age, ageMonths) => {
    const h = await harness();
    for (const [id, value] of edits) h.edit(id, value);
    // No timers or manual flush between the user's event and restoration.
    h.restore();
    const shared = h.read();
    expect({ age: h.fields.age.value, ageMonths: h.fields.ageMonths.value }).toEqual({ age, ageMonths });
    expect({ age: shared.age, ageMonths: shared.ageMonths }).toEqual({ age, ageMonths });
    expect({ age: shared._vildaPersist.byId.age, ageMonths: shared._vildaPersist.byId.ageMonths }).toEqual({ age, ageMonths });
  });

  it('does not write shared data while the persistence guard suppresses autosave', async () => {
    const h = await harness();
    const before = clone(h.read());
    const sessionWrites = vi.spyOn(h.win.sessionStorage, 'setItem');
    const localWrites = vi.spyOn(h.win.localStorage, 'setItem');
    h.win.VildaPersistence.pauseAutosave(900);
    h.edit('age', '40');
    h.edit('ageMonths', '8');
    expect(h.read()).toEqual(before);
    expect(sessionWrites).not.toHaveBeenCalled();
    expect(localWrites).not.toHaveBeenCalled();
  });

  it('preserves unrelated state and stored fields absent from this DOM', async () => {
    const h = await harness({ missingFields: ['height'] });
    const before = clone(h.read());
    h.edit('age', '40');
    const shared = h.read();
    expect(shared.age).toBe('40');
    expect(shared._vildaPersist.byId.age).toBe('40');
    expect(shared.height).toBe(before.height);
    expect(shared._vildaPersist.byId.height).toBe(before._vildaPersist.byId.height);
    expect(shared._vildaPersist.byId.absentControl).toBe('keep');
    expect(shared.unrelated).toEqual(before.unrelated);
    expect(shared._vildaPersist.globals).toEqual(before._vildaPersist.globals);
    expect(shared._vildaPersist.byName).toEqual(before._vildaPersist.byName);
    expect(shared._vildaPersist.datasetById).toEqual(before._vildaPersist.datasetById);
  });

  it('does not create missing byId entries while publishing the shared form', async () => {
    const h = await harness({ omitById: ['age', 'ageMonths', 'weight'] });
    for (const id of ['age', 'ageMonths', 'weight']) expect(owns(h.read()._vildaPersist.byId, id)).toBe(false);
    h.edit('age', '40');
    h.edit('ageMonths', '8');
    const shared = h.read();
    expect({ age: shared.age, ageMonths: shared.ageMonths }).toEqual({ age: '40', ageMonths: '8' });
    for (const id of ['age', 'ageMonths', 'weight']) expect(owns(shared._vildaPersist.byId, id)).toBe(false);
    expect(shared._vildaPersist.byId.height).toBe('165');
    expect(shared._vildaPersist.globals.untouched).toEqual({ keep: 'globals' });
  });
});
