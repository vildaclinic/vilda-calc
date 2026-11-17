import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { wytnijFunkcje } from './sesja-zapisu-uprzaz.mjs';

const selectionKey = 'LAB_CONV_SUBSTANCE';
const unitKeys = ['LAB_CONV_UNIT:cortisol', 'LAB_CONV_UNIT:target:cortisol', 'LAB_CONV_UNIT:obsolete-test'];
const authSource = fs.readFileSync(new URL('../../vilda_auth_ui.js', import.meta.url), 'utf8');

function storage() {
  const data = new Map();
  return {
    get length() { return data.size; },
    key: index => [...data.keys()][index] ?? null,
    getItem: key => data.get(String(key)) ?? null,
    setItem: (key, value) => { data.set(String(key), String(value)); },
    removeItem: key => { data.delete(String(key)); },
    clear: () => { throw new Error('A lab reset must never clear a whole storage'); }
  };
}

function harness(mode = 'normal', { memoryFallback = false } = {}) {
  const local = storage(), session = storage(), events = [];
  if (memoryFallback) session.setItem = () => { throw new Error('Fictional blocked session storage'); };
  const win = {
    localStorage: local, sessionStorage: session, navigator: {}, name: '',
    dispatchEvent: event => { events.push(event); },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }
  };
  loadBrowserScript('vilda_persistence_adapter.js', win);
  const api = win.VildaPersistence;
  if (mode === 'ephemeral') api.setEphemeralMode(true);
  if (mode === 'cloud-only') api.setCloudOnlyMode(true);
  const active = mode === 'normal' ? local : session;
  const prefix = mode === 'normal' ? '' : 'veph:l:';
  return { win, api, local, session, active, prefix, events };
}

function seed(api) {
  expect(api.writePreferenceRaw(selectionKey, 'cortisol')).toBe(true);
  unitKeys.forEach(key => expect(api.writePreferenceRaw(key, 'FICTIONAL-UNIT')).toBe(true));
}

function expectEmpty(api) {
  [selectionKey, ...unitKeys].forEach(key => expect(api.readPreferenceRaw(key)).toBeNull());
}

describe.each(['normal', 'ephemeral', 'cloud-only'])('lab converter reset: %s', mode => {
  it('clears persisted selection and all unit keys without requiring the lab page to load', () => {
    const h = harness(mode);
    // Seed existing storage directly, including an obsolete substance absent from
    // current laboratory data. Reset must not depend on registering a UI read.
    [selectionKey, ...unitKeys].forEach(key => h.active.setItem(h.prefix + key, 'FICTIONAL-LEGACY'));
    h.active.setItem(h.prefix + 'LAB_CONV_UNIT_RELATED', 'FICTIONAL-UNRELATED');
    h.local.setItem('labAssayProfiles', 'FICTIONAL-PROFILE');
    h.local.setItem('labPackageSettings', 'FICTIONAL-PACKAGE-SETTINGS');
    h.local.setItem('labCustomPackages::FICTIONAL-USER', 'FICTIONAL-PACKAGE');
    if (mode === 'normal') h.session.setItem('veph:l:' + selectionKey, 'FICTIONAL-OTHER-NAMESPACE');
    else h.local.setItem(selectionKey, 'FICTIONAL-OTHER-NAMESPACE');

    expect(h.api.clearUserState()).toBe(true);

    expectEmpty(h.api);
    expect(h.active.getItem(h.prefix + 'LAB_CONV_UNIT_RELATED')).toBe('FICTIONAL-UNRELATED');
    expect(h.local.getItem('labAssayProfiles')).toBe('FICTIONAL-PROFILE');
    expect(h.local.getItem('labPackageSettings')).toBe('FICTIONAL-PACKAGE-SETTINGS');
    expect(h.local.getItem('labCustomPackages::FICTIONAL-USER')).toBe('FICTIONAL-PACKAGE');
    expect(mode === 'normal' ? h.session.getItem('veph:l:' + selectionKey) : h.local.getItem(selectionKey))
      .toBe('FICTIONAL-OTHER-NAMESPACE');
    expect(h.events.at(-1).detail.moduleRemovedKeys).toEqual(expect.arrayContaining([selectionKey, ...unitKeys]));
  });

  it('resets only the lab scope while autosave writes remain suppressed', () => {
    const h = harness(mode);
    seed(h.api);
    h.api.writePreferenceRaw('GH_THERAPY_POINTS', 'FICTIONAL-THERAPY');
    h.api.markClearInProgress(2500);
    expect(h.api.writePreferenceRaw(selectionKey, '')).toBe(false);

    const result = h.api.clearModuleState({ scope: 'lab', dispatchEvent: false });

    expect(result.ok).toBe(true);
    expect(result.removedKeys).toEqual(expect.arrayContaining([selectionKey, ...unitKeys]));
    expectEmpty(h.api);
    expect(h.api.readPreferenceRaw('GH_THERAPY_POINTS')).toBe('FICTIONAL-THERAPY');
    expect(h.events).toEqual([]);
    expect(h.api.isClearInProgress()).toBe(true);
    expect(h.api.writePreferenceRaw(selectionKey, 'cortisol')).toBe(false);
  });

  it('keeps the lab choices when another clinical module is cleared', () => {
    const h = harness(mode);
    seed(h.api);
    h.api.clearModuleState({ scope: 'gh' });
    expect(h.api.readPreferenceRaw(selectionKey)).toBe('cortisol');
    unitKeys.forEach(key => expect(h.api.readPreferenceRaw(key)).toBe('FICTIONAL-UNIT'));
  });

  it.each([false, true])('auth resets lab state with clearAllData available: %s', hasGlobalClear => {
    const h = harness(mode);
    seed(h.api);
    const resetWitness = [];
    const dispatch = h.win.dispatchEvent;
    h.win.dispatchEvent = event => {
      if (event.type === 'vilda:user-state-cleared') {
        resetWitness.push([selectionKey, ...unitKeys].map(key => h.api.readPreferenceRaw(key)));
      }
      dispatch(event);
    };
    if (hasGlobalClear) h.win.clearAllData = () => h.api.clearUserState();
    else h.api.markClearInProgress(2500);
    // Execute the production auth function, with only its error logger replaced.
    const reset = new Function('i', 'Ot', wytnijFunkcje(authSource, 'qa') + ';return qa;')(h.win, () => {});

    reset('FICTIONAL-SESSION-RESET');

    expectEmpty(h.api);
    expect(h.api.isClearInProgress()).toBe(true);
    // The real lab DOM listens for this window event. Both paths announce the
    // cleared state once, after persisted choices have already been removed.
    expect(resetWitness).toEqual([[null, null, null, null]]);
  });
});

it('also removes dynamic units from the existing in-memory ephemeral fallback', () => {
  const h = harness('ephemeral', { memoryFallback: true });
  seed(h.api);
  expect(h.api.clearModuleState({ scope: 'lab' }).ok).toBe(true);
  expectEmpty(h.api);
});

it('reports a failed unit-key enumeration without claiming that reset succeeded', () => {
  const h = harness();
  seed(h.api);
  h.local.key = () => { throw new Error('FICTIONAL-STORAGE-FAILURE'); };
  const result = h.api.clearModuleState({ scope: 'lab' });
  expect(result.ok).toBe(false);
  expect(result.failedKeys).toContain('LAB_CONV_UNIT:*');
  expect(h.api.readPreferenceRaw(selectionKey)).toBeNull();
  expect(h.api.readPreferenceRaw(unitKeys[0])).toBe('FICTIONAL-UNIT');
});
