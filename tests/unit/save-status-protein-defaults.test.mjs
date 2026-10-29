import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const MAIN = { name: 'Fikcyjny Pacjent Białka DZM', user: { age: 10, sex: 'M', height: 135, weight: 30 } };
const PID = 'fictional-protein-dzm-chip';

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
  for (const file of ['clcr_collection_duration.js', 'clcr_protein_dzm_ui.js', 'inline_kalkulator_klirens_07.js']) {
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

describe('patient chip — protein DZM controls emitted by the real UI and session collector', () => {
  it('an untouched mounted protein DZM calculator is equivalent to an absent calculator', () => {
    const runtime = collector(), captured = runtime.capture();
    expect(captured.inputs).toMatchObject({ Prot_inputMode: 'concentration', Prot_collectionHours: '24',
      Prot_collectionSource: 'assumed-24h', Prot_durationNeedsConfirmation: 'false' });
    const env = status();
    const reference = env.indicator.getReferenceFingerprint();
    env.compare(captured);
    expect(env.indicator.getState()).toBe('saved');
    expect(env.indicator._computeCanonicalFingerprint()).toBe(reference);
    expect(env.session()).toEqual(captured);
    expect(runtime.document.getElementById('Prot_durationNeedsConfirmation').value).toBe('false');
  });

  it('a legacy reference normalizes the same actual collector defaults', () => {
    const captured = collector().capture();
    const env = status({ legacy: captured });
    env.compare(null);
    expect(env.indicator.getState()).toBe('saved');
  });

  it.each([
    ['Prot_concentration', '20'], ['Prot_concentration', '0'], ['Prot_volume', '1500'],
    ['Prot_reportedValue', '0'], ['Prot_reportedValue', '0.015'],
    ['Prot_reportedValue', '750'], ['Prot_inputMode', 'reported'],
    ['Prot_unitConversions', '{"concentration":{"originalValue":"20","originalUnit":"mg/dL"}}'],
    ['Prot_collectionHours', '12'], ['Prot_collectionHours', '0'], ['Prot_collectionHours', 'invalid'],
    ['Prot_collectionSource', 'hours'],
    ['Prot_collectionSource', 'historical-missing'], ['Prot_durationNeedsConfirmation', 'true'],
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
    runtime.set('Prot_collectionHours', '');
    runtime.set('Prot_collectionSource', 'historical-missing');
    runtime.set('Prot_durationNeedsConfirmation', 'true');
    const captured = runtime.capture();
    expect(captured.inputs).toMatchObject({ Prot_collectionHours: '', Prot_collectionSource: 'historical-missing', Prot_durationNeedsConfirmation: 'true' });
    env.compare(captured);
    expect(env.indicator.getState()).toBe('dirty');
  });

  it('keeps the saved historical gap unmodified while comparing its fingerprint', () => {
    const runtime = collector();
    runtime.set('Prot_collectionHours', '');
    runtime.set('Prot_collectionSource', 'historical-missing');
    runtime.set('Prot_durationNeedsConfirmation', 'true');
    const captured = runtime.capture(), before = clone(captured);
    const env = status({ legacy: captured });
    env.compare(captured);
    expect(env.indicator.getState()).toBe('saved');
    expect(env.session()).toEqual(before);
    expect(captured).toEqual(before);
    expect(runtime.document.getElementById('Prot_collectionHours').value).toBe('');
    expect(runtime.document.getElementById('Prot_durationNeedsConfirmation').value).toBe('true');
  });

  it('treats an explicit 24-hour collection as different from the untouched assumed day', () => {
    const runtime = collector(), captured = runtime.capture();
    const env = status({ legacy: captured });
    runtime.set('Prot_collectionSource', 'hours');
    const edited = runtime.capture();
    env.compare(edited);
    expect(env.indicator.getState()).toBe('dirty');
    expect(env.session().inputs).toMatchObject({ Prot_collectionHours: '24', Prot_collectionSource: 'hours' });
  });

  it('normalizes a legacy explicit duration without manufacturing assumed provenance', () => {
    const runtime = collector();
    runtime.set('Prot_collectionSource', 'hours');
    const captured = runtime.capture(), legacy = clone(captured);
    delete legacy.inputs.Prot_collectionSource;
    const env = status({ legacy });
    env.compare(captured);
    expect(env.indicator.getState()).toBe('saved');
    expect(env.session().inputs.Prot_collectionSource).toBe('hours');
    expect(legacy.inputs).not.toHaveProperty('Prot_collectionSource');
  });
});
