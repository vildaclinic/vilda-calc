import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const storage = () => {
  const items = new Map();
  return { getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, String(value)),
    removeItem: key => items.delete(key), key: i => [...items.keys()][i] ?? null, get length() { return items.size; } };
};
const currentName = 'Fikcyjny Pacjent Ogonka LH';
const oldName = 'Poprzednia nazwa tej samej fikcyjnej osoby';

// Real adapter, runtime and Session consumer. The second writer represents
// userData/DOB publishing the complete current form after a queued age input.
function harness({ field = 'name', initialAliases = {} } = {}) {
  const events = {};
  const fields = {};
  const document = { readyState: 'complete', hidden: false,
    addEventListener(type, listener) { (events[type] ||= []).push(listener); },
    dispatchEvent(event) { for (const listener of events[event.type] || []) listener(event); return true; },
    getElementById: id => fields[id] || null, getElementsByName: () => [], querySelectorAll: () => [] };
  for (const id of ['age', 'ageMonths', 'weight', 'height', 'sex', ...(field ? [field] : [])]) {
    fields[id] = { id, tagName: 'INPUT', type: id === field ? 'text' : 'number',
      value: ({ age: '0', ageMonths: '9', weight: '8', height: '70', sex: 'M' })[id] ?? currentName,
      dataset: {}, disabled: false, closest: () => null,
      dispatchEvent(event) { return document.dispatchEvent({ type: event.type, target: this, isTrusted: false }); } };
  }
  const win = new EventTarget();
  let unlocked = true;
  Object.assign(win, { document, sessionStorage: storage(), localStorage: storage(), vildaAppOnReady() {},
    setTimeout, clearTimeout, CustomEvent, Event,
    VildaVault: { isUnlocked: () => unlocked }, VildaPanelPacjent: { nieaktualny: () => false } });
  win.sessionStorage.setItem('vildaCurrentPatientId', 'fictional-lh-infant-a');
  for (const file of ['vilda_persistence_adapter.js', 'vilda_persist_runtime.js', 'vilda_session_bridge.js']) {
    new Function('window', 'globalThis', 'document', source(file))(win, win, document);
  }
  win.VildaPersistRuntime.init();
  const base = { age: '0', ageMonths: '9', height: '70', weight: '8', sex: 'M', unrelated: 'queued value',
    ...initialAliases, _vildaPersist: { byId: { age: '0', ageMonths: '9', ...initialAliases } } };
  win.VildaPersistence.writeShared(clone(base), { force: true });
  const queue = (id = 'ageMonths', value = '9') => {
    fields[id].value = value;
    document.dispatchEvent({ type: 'input', target: fields[id], isTrusted: true });
  };
  const publish = aliases => {
    const fresh = { ...clone(base), unrelated: 'fresh value', ...aliases };
    for (const key of ['name', 'fullName']) if (!(key in aliases)) delete fresh[key];
    win.VildaPersistence.writeShared(fresh, { force: true });
    return clone(win.VildaPersistence.readShared());
  };
  const saved = () => win.VildaPersistence.readShared();
  const readFromConverter = () => {
    const element = field && fields[field];
    if (field) delete fields[field];
    try { return win.VildaSession.getPatient(); } finally { if (field) fields[field] = element; }
  };
  return { win, fields, queue, publish, saved, readFromConverter, lock: () => { unlocked = false; } };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('P-PERSIST-CURRENT-NAME — queued autosave preserves the current form name', () => {
  it.each([
    ['name', { name: currentName }],
    ['name', { fullName: currentName }],
    ['fullName', { name: currentName }],
    ['fullName', { fullName: currentName }],
  ])('%s: later canonical aliases survive the real deferred flush: %j', async (field, aliases) => {
    const h = harness({ field });
    h.queue();
    h.publish(aliases);
    await vi.advanceTimersByTimeAsync(300);
    const saved = h.saved();
    for (const key of ['name', 'fullName']) expect(saved[key]).toBe(aliases[key]);
    expect(saved.unrelated, 'the change must not merge unrelated newer data into the old queue').toBe('queued value');
    expect(h.readFromConverter()).toMatchObject({ name: currentName, age: 0, ageMonths: 9, source: 'shared' });
  });

  it('force uses the newer matching alias and removes the obsolete alternative before restore', () => {
    const h = harness({ initialAliases: { name: oldName, fullName: oldName } });
    h.queue();
    h.publish({ fullName: currentName });
    h.win.vildaPersistFlushNow({ force: true });
    expect(h.saved().name).toBeUndefined();
    expect(h.saved().fullName).toBe(currentName);
    expect(h.saved()._vildaPersist.byId.name).toBeUndefined();
    expect(h.saved()._vildaPersist.byId.fullName).toBe(currentName);
    h.win.vildaPersistRestoreAll();
    expect(h.fields.name.value).toBe(currentName);
  });

  it('explicit clearing is not replaced with an older queued name or alternative alias', async () => {
    const h = harness({ initialAliases: { name: oldName, fullName: oldName } });
    h.queue();
    h.fields.name.value = '';
    h.publish({});
    await vi.advanceTimersByTimeAsync(300);
    for (const key of ['name', 'fullName']) {
      expect(h.saved()[key]).toBeUndefined();
      expect(h.saved()._vildaPersist.byId[key]).toBeUndefined();
    }
    expect(h.readFromConverter()).toBeNull();
  });

  it('a real user name-clear input keeps both aliases empty despite a later stale writer', () => {
    const h = harness({ initialAliases: { name: oldName, fullName: oldName } });
    h.queue('name', '');
    h.publish({ name: oldName, fullName: oldName });
    h.win.vildaPersistFlushNow({ force: true });
    expect(h.saved()).toMatchObject({ name: '', fullName: '' });
    expect(h.readFromConverter()).toBeNull();
  });

  it.each([oldName, currentName])('a different patient ID invalidates the queue, including the same name: %s', async queuedName => {
    const h = harness({ initialAliases: { name: queuedName } });
    h.queue();
    h.win.sessionStorage.setItem('vildaCurrentPatientId', 'fictional-lh-infant-b');
    const fresh = h.publish({ name: currentName });
    h.win.vildaPersistFlushNow({ force: true });
    await vi.advanceTimersByTimeAsync(300);
    expect(h.saved()).toEqual(fresh);
  });

  it('does not borrow a conflicting fresh name from a different form context', async () => {
    const h = harness({ initialAliases: { name: oldName } });
    h.fields.name.value = oldName;
    h.queue();
    h.publish({ name: currentName });
    await vi.advanceTimersByTimeAsync(300);
    expect(h.saved().name).toBe(oldName);
    expect(h.saved().fullName).toBeUndefined();
  });

  it('does not borrow a name on a page without a name field', async () => {
    const h = harness({ field: null });
    h.queue();
    h.publish({ name: currentName });
    await vi.advanceTimersByTimeAsync(300);
    expect(h.saved().name).toBeUndefined();
    expect(h.saved().fullName).toBeUndefined();
  });

  it('locking and clearing the shared name cannot reintroduce a queued name from the still-visible DOM', () => {
    const h = harness({ initialAliases: { name: currentName, fullName: currentName } });
    h.queue();
    h.lock();
    h.publish({});
    h.win.vildaPersistFlushNow({ force: true });
    for (const key of ['name', 'fullName']) {
      expect(h.saved()[key]).toBeUndefined();
      expect(h.saved()._vildaPersist.byId[key]).toBeUndefined();
    }
    expect(h.readFromConverter()).toBeNull();
  });
});
