import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const MAIN = { name: 'Fikcyjny Pacjent PO4 Chipa', user: { age: 10, sex: 'M', height: 135, weight: 30 } };
const PID = 'fictional-po4-chip';

// The actual UI creates its hidden controls; the complete shipped renal
// serializer captures them. This boundary has no clinical engine or browser.
function collector() {
  const document = atrapaDokumentu();
  const create = document.createElement;
  document.createElement = tag => {
    const node = create(tag);
    node.append = (...children) => children.forEach(child => node.appendChild(child));
    return node;
  };
  document.querySelector = selector => document.documentElement.querySelector(selector);
  document.querySelectorAll = selector => document.documentElement.querySelectorAll(selector);
  const form = document.createElement('form');
  form.id = 'clcrForm';
  document.body.appendChild(form);
  const window = { document, currentVersion: 'basic', addEventListener() {},
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
  document.defaultView = window;
  const context = vm.createContext({ window, document, setTimeout: () => 0, clearTimeout() {} });
  for (const file of ['clcr_collection_duration.js', 'clcr_po4_dzm_ui.js', 'inline_kalkulator_klirens_07.js']) {
    vm.runInContext(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'), context, { filename: file });
  }
  return { document,
    capture: () => clone(window.buildClcrSessionSnapshot()),
    set(field, value) { document.getElementById(field).value = value; } };
}

function status({ legacy } = {}) {
  let session = null;
  const storage = new Map([['vildaCurrentPatientId', PID]]);
  if (legacy) storage.set('vilda-save-ref-v1', JSON.stringify({ fp: JSON.stringify({ core: MAIN, clcr: legacy }), dirty: true }));
  const win = {
    setTimeout, clearTimeout, setInterval, clearInterval, addEventListener() {}, console: { debug() {} },
    document: { readyState: 'complete', addEventListener() {}, getElementById: () => null },
    sessionStorage: { getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    VildaVault: { isUnlocked: () => true, onPatientSaved() {} },
    VildaDataImportExport: { getApplyLoadedDataSequence: () => 1 },
    VildaPersistence: { readMainSession: () => clone(MAIN), readClcrSession: () => session && clone(session) },
    collectUserData: () => clone(MAIN), hasMeaningfulMainSessionData: value => Boolean(value?.name),
  };
  loadBrowserScript('vilda_save_status_indicator.js', win);
  const indicator = win.VildaSaveStatusIndicator;
  if (!legacy) {
    indicator._onPatientLoaded({ patientId: PID, applySequence: 1, name: MAIN.name });
    vi.advanceTimersByTime(150);
  }
  return { indicator, session: () => clone(session),
    compare(value) { session = value && clone(value); indicator.notifyExternalChange(); vi.advanceTimersByTime(400); } };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('patient chip — PO4 controls emitted by the real UI and session collector', () => {
  it('an untouched mounted PO4 calculator is equivalent to an absent calculator', () => {
    const runtime = collector(), captured = runtime.capture();
    expect(captured.inputs).toMatchObject({ PO4_inputMode: 'concentration', PO4_collectionHours: '24',
      PO4_collectionSource: 'assumed-24h', PO4_durationNeedsConfirmation: 'false' });
    const env = status();
    const reference = env.indicator.getReferenceFingerprint();
    env.compare(captured);
    expect(env.indicator.getState()).toBe('saved');
    expect(env.indicator._computeCanonicalFingerprint()).toBe(reference);
    expect(env.session()).toEqual(captured);
    expect(runtime.document.getElementById('PO4_durationNeedsConfirmation').value).toBe('false');
  });

  it('a legacy reference normalizes the same actual collector defaults', () => {
    const captured = collector().capture();
    const env = status({ legacy: captured });
    env.compare(null);
    expect(env.indicator.getState()).toBe('saved');
  });

  it.each([
    ['PO4_concentration', '20'], ['PO4_concentration', '0'], ['PO4_volume', '1500'],
    ['PO4_reportedValue', '750'], ['PO4_inputMode', 'reported'],
    ['PO4_unitConversions', '{"concentration":{"originalValue":"20","originalUnit":"mgP/dL"}}'],
    ['PO4_collectionHours', '12'], ['PO4_collectionSource', 'hours'],
    ['PO4_collectionSource', 'historical-missing'], ['PO4_durationNeedsConfirmation', 'true'],
  ])('retains the actual collected patient input %s=%s', (field, value) => {
    const runtime = collector(), env = status();
    runtime.set(field, value);
    const captured = runtime.capture();
    env.compare(captured);
    expect(env.indicator.getState()).toBe('dirty');
    expect(env.session()).toEqual(captured);
  });

  it('keeps a historical missing duration and its confirmation marker', () => {
    const runtime = collector(), env = status();
    runtime.set('PO4_collectionHours', '');
    runtime.set('PO4_collectionSource', 'historical-missing');
    runtime.set('PO4_durationNeedsConfirmation', 'true');
    const captured = runtime.capture();
    expect(captured.inputs).toMatchObject({ PO4_collectionHours: '', PO4_collectionSource: 'historical-missing', PO4_durationNeedsConfirmation: 'true' });
    env.compare(captured);
    expect(env.indicator.getState()).toBe('dirty');
  });
});
