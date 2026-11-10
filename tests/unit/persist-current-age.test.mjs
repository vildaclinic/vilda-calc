import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');

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

const FIELDS = ['name', 'age', 'ageMonths', 'weight', 'height', 'sex'];
const FORM = { age: '0', ageMonths: '4', weight: '5.5', height: '60' };
const NAME = 'Fikcyjna Pacjentka wieku AMH';

// P-PERSIST-CURRENT-AGE. Actual adapter, persistence runtime and userData
// listeners; only the DOM/storage platform is modeled (document capture runs
// before the field listener). The starting root has no age, weight or height,
// as the load-time flush leaves it in the recorded failing run of
// hormone-lifespan-amh-age-context.spec.mjs. Fictional data only.
async function harness({ missingFields = [], vault = null, rootExtra = {} } = {}) {
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
  function dispatch(field, type, trusted) {
    const event = { type, target: field, isTrusted: trusted };
    invoke(listeners, event, true);
    invoke(field.listeners, event, true);
    invoke(field.listeners, event, false);
    invoke(listeners, event, false);
    return true;
  }
  for (const id of FIELDS) {
    if (missingFields.includes(id)) continue;
    fields[id] = { id, tagName: id === 'sex' ? 'SELECT' : 'INPUT',
      type: ['name', 'sex'].includes(id) ? 'text' : 'number', value: '', dataset: {},
      disabled: false, listeners: {}, closest: () => null,
      addEventListener(type, callback, options) { add(this.listeners, type, callback, options); },
      dispatchEvent(event) { return dispatch(this, event.type, false); },
    };
  }
  const win = new EventTarget();
  Object.assign(win, { document, sessionStorage: storage(), localStorage: storage(),
    setTimeout, clearTimeout, Event, CustomEvent, vildaAppOnReady() {},
    VildaPanelPacjent: { nieaktualny: () => false },
    ...(vault ? { VildaVault: vault } : {}),
  });
  win.sessionStorage.setItem('vildaCurrentPatientId', 'fictional-current-age');
  const load = file => new Function('window', 'globalThis', 'document', source(file))(win, win, document);
  load('vilda_persistence_adapter.js');
  win.VildaPersistence.writeShared({ name: NAME, sex: 'F', unrelated: 'queued value',
    _vildaPersist: { byId: { name: NAME, sex: 'F' } }, ...rootExtra }, { force: true });
  load('vilda_persist_runtime.js');
  win.VildaPersistRuntime.init();
  load('userData.js');
  win.vildaPersistRestoreAll();
  win.vildaPersistRestoreFinishNow();
  await vi.advanceTimersByTimeAsync(1000);
  expect(win.VildaPersistence.isRestoring()).toBe(false);
  expect(win.VildaPersistence.isAutosaveSuppressed()).toBe(false);
  expect(fields.sex?.value ?? 'F').toBe('F');
  expect(win.VildaPersistence.readShared()).toMatchObject({ name: NAME, sex: 'F', unrelated: 'queued value' });
  return { win, fields,
    read: () => win.VildaPersistence.readShared(),
    // A value set by code (vilda_dob_age.js ustawZPowiadomieniem): untrusted input + change.
    program(id, value) { fields[id].value = value; dispatch(fields[id], 'input', false); dispatch(fields[id], 'change', false); },
    edit(id, value) { fields[id].value = value; dispatch(fields[id], 'input', true); },
    publish(values) { win.VildaPersistence.writeShared({ ...win.VildaPersistence.readShared(), ...values }, { force: true }); },
  };
}

// The recorded order: a field is set while the post-load pause still rejects
// both writers; the pause ends; the next programmatic field event is accepted
// by both, so userData publishes the complete form while the queue lacks the
// earlier field. The queued flush must not remove that current field again.
async function straddle(h, early, late = early === 'ageMonths' ? 'age' : 'ageMonths') {
  h.win.VildaPersistence.pauseAutosave(400);
  h.program(early, FORM[early]);
  expect(h.read()[early], 'both writers reject the event inside the pause').toBeUndefined();
  await vi.advanceTimersByTimeAsync(450);
  expect(h.win.VildaPersistence.isAutosaveSuppressed()).toBe(false);
  h.program(late, FORM[late]);
  expect({ [early]: h.read()[early], [late]: h.read()[late] }, 'userData publishes the whole current form')
    .toEqual({ [early]: FORM[early], [late]: FORM[late] });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-17T13:00:00Z'));
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('P-PERSIST-CURRENT-AGE — a queued autosave keeps current core form fields', () => {
  it.each(['age', 'ageMonths', 'weight', 'height'])('%s set inside the pause survives the debounced flush', async key => {
    const h = await harness();
    await straddle(h, key);
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.read()[key]).toBe(FORM[key]);
  });

  it('the recorded AMH sequence keeps years and months through the timer and the pagehide flush', async () => {
    const h = await harness();
    await straddle(h, 'age', 'ageMonths');
    await vi.advanceTimersByTimeAsync(1000);
    expect({ age: h.read().age, ageMonths: h.read().ageMonths }).toEqual({ age: '0', ageMonths: '4' });
    h.win.vildaPersistFlushNow({ force: true });
    expect({ age: h.read().age, ageMonths: h.read().ageMonths, sex: h.read().sex })
      .toEqual({ age: '0', ageMonths: '4', sex: 'F' });
  });

  it('borrows the matching existing byId entry', async () => {
    const h = await harness({ rootExtra: { _vildaPersist: { byId: { name: NAME, sex: 'F', age: '' } } } });
    await straddle(h, 'age');
    expect(h.read()._vildaPersist.byId.age, 'userData updates its own existing byId entry').toBe('0');
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.read()._vildaPersist.byId.age).toBe('0');
  });

  it('keeps the queued value that matches the form against a later conflicting writer', async () => {
    const h = await harness();
    h.edit('age', '7');
    h.publish({ age: '6' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.read().age).toBe('7');
  });

  it('keeps a user edit learned by the queue against a later echo in the form', async () => {
    const h = await harness({ rootExtra: { ageMonths: '4' } });
    h.win.VildaPersistence.pauseAutosave(900);
    h.edit('ageMonths', '3');
    h.program('ageMonths', '4');
    h.publish({ ageMonths: '4' });
    h.win.vildaPersistFlushNow({ force: true });
    expect(h.read().ageMonths).toBe('3');
  });

  it('keeps an explicit clear against a later stale writer', async () => {
    const h = await harness();
    h.edit('weight', '9');
    await vi.advanceTimersByTimeAsync(1000);
    h.edit('weight', '');
    h.publish({ weight: '9' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.read().weight).toBe('');
  });

  it('borrows a newer empty value that matches a field cleared by code', async () => {
    const h = await harness({ rootExtra: { height: '60' } });
    h.edit('weight', '5.5');
    h.fields.height.value = '';
    h.publish({ height: '' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.read().height).toBe('');
  });

  it('does not merge unrelated newer data into the queue', async () => {
    const h = await harness();
    await straddle(h, 'age');
    h.publish({ unrelated: 'fresh value' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.read().age).toBe('0');
    expect(h.read().unrelated).toBe('queued value');
  });

  it('does not borrow a key on a page without that field', async () => {
    const h = await harness({ missingFields: ['height'] });
    h.edit('weight', '5.5');
    h.publish({ height: '60' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.read().weight).toBe('5.5');
    expect(h.read().height).toBeUndefined();
  });

  it('does not borrow while the vault is explicitly locked', async () => {
    let unlocked = true;
    const h = await harness({ vault: { isUnlocked: () => unlocked } });
    h.edit('weight', '5.5');
    h.fields.age.value = '0';
    h.publish({ age: '0' });
    unlocked = false;
    h.win.vildaPersistFlushNow({ force: true });
    expect(h.read().age).toBeUndefined();
  });

  it('a different patient still invalidates the queue before any reconciliation', async () => {
    const h = await harness();
    h.edit('weight', '5.5');
    h.win.sessionStorage.setItem('vildaCurrentPatientId', 'fictional-current-age-b');
    h.fields.age.value = '3';
    h.publish({ age: '3', unrelated: 'second person' });
    const fresh = h.read();
    h.win.vildaPersistFlushNow({ force: true });
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.read()).toEqual(fresh);
  });
});
