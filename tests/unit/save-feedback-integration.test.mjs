import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Exercise the production save/import module. Only the visual sink and vault I/O
// are substituted; the payload, save Promise, targeting and status calls are real.
const payload = () => ({
  version: 1, name: 'Fikcyjny Integracyjny',
  user: { firstName: 'Integracyjny', lastName: 'Fikcyjny', age: 9, ageMonths: 3, sex: 'M', height: 136, weight: 29 },
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function environment({ feedback = true, route = '/index.html', patientId = 'fictional-first', adoptSavedPatient = false } = {}) {
  const storage = new Map(patientId ? [['vildaCurrentPatientId', patientId]] : []);
  const events = [];
  const messages = [];
  const fallback = [];
  const focused = [];
  const elements = Object.fromEntries(['age', 'weight', 'height', 'lastName'].map(id => [id, {
    id, value: '', focus: () => focused.push(id), scrollIntoView() {},
  }]));
  let epoch = 0, editRevision = 0, unlocked = true, value = payload();
  const win = {
    document: {
      readyState: 'complete', hidden: false,
      getElementById: id => elements[id] || null,
      querySelectorAll: () => [], querySelector: () => null,
      addEventListener() {}, removeEventListener() {},
      dispatchEvent: event => {
        events.push(event);
        if (adoptSavedPatient && event.type === 'vilda:patient-loaded' && event.detail?.patientId) {
          storage.set('vildaCurrentPatientId', event.detail.patientId);
        }
        return true;
      },
    },
    location: { pathname: route },
    setTimeout, clearTimeout, setInterval, clearInterval,
    addEventListener() {}, removeEventListener() {},
    sessionStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, entry) => storage.set(key, String(entry)),
      removeItem: key => storage.delete(key),
    },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    Event: class { constructor(type) { this.type = type; } },
    VildaVault: {
      isUnlocked: () => unlocked,
      savePatient: vi.fn(async () => ({
        patientId: patientId || 'fictional-created', snapshotId: 'fictional-snapshot', snapshotCount: 2,
        savedAtISO: '2026-10-24T12:00:00.000Z', header: { name: value.name }, isNew: !patientId,
      })),
    },
    VildaStatusBar: { pokaz: message => { fallback.push(message); return true; }, wyczysc() {} },
    VildaSaveStatusIndicator: { notifySaveFailed: vi.fn() },
    alert: vi.fn(),
    lastLoadedData: patientId ? structuredClone(value) : null,
  };
  const supported = () => ['/index.html', '/docpro.html'].includes(win.location.pathname);
  const current = (scope, options = {}) => Boolean(scope && supported() && scope.document === win.document
    && scope.route === win.location.pathname && scope.epoch === epoch && scope.editRevision === editRevision && (!scope.unlocked || unlocked)
    && (Object.hasOwn(options, 'patientId') ? options.patientId : scope.patientId) === (storage.get('vildaCurrentPatientId') || null)
    && scope.applySequence === win.VildaDataImportExport.getApplyLoadedDataSequence());
  if (feedback) win.VildaSaveFeedback = {
    capture: () => supported() ? Object.freeze({
      document: win.document, route: win.location.pathname, epoch, editRevision, unlocked,
      patientId: storage.get('vildaCurrentPatientId') || null,
      applySequence: win.VildaDataImportExport.getApplyLoadedDataSequence(),
    }) : null,
    isCurrent: current,
    pokaz: message => {
      if (!supported()) return false;
      // The renderer consumes stale messages without falling through to an old
      // in-flow strip; its own detailed lifetime tests cover real host scopes.
      if (current(message.scope, message)) messages.push(message);
      return true;
    },
    wyczysc() {},
  };
  loadBrowserScript('vilda_data_import_export.js', win);
  return {
    win, storage, events, messages, fallback, focused,
    save: () => win.VildaDataImportExport.saveUserData({ collectUserData: () => value }),
    get payload() { return value; },
    setPayload(next) { value = next; },
    editPayload(next) { value = next; editRevision++; },
    invalidate(reason) {
      if (reason === 'patient') storage.set('vildaCurrentPatientId', 'fictional-second');
      if (reason === 'route') win.location.pathname = '/docpro.html';
      if (reason === 'clear') { epoch++; storage.delete('vildaCurrentPatientId'); }
      if (reason === 'lock') { epoch++; unlocked = false; }
      if (reason === 'import') win.VildaDataImportExport.applyLoadedData(structuredClone(value), { isSessionRestore: true });
    },
  };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-24T12:00:00Z')); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('main save feeds the approved overlay without changing its public return contract', () => {
  it('validation still returns null synchronously, names the missing fields and focuses the first one', () => {
    const env = environment();
    env.setPayload({ name: 'Fikcyjny Integracyjny', user: { height: 136 } });
    expect(env.save()).toBeNull();
    expect(env.win.VildaVault.savePatient).not.toHaveBeenCalled();
    expect(env.messages).toEqual([expect.objectContaining({
      ton: 'blad', tekst: 'Nie zapisano — uzupełnij: wiek i masę ciała.',
      pola: [{ id: 'age', etykieta: 'wiek' }, { id: 'weight', etykieta: 'masę ciała' }],
    })]);
    expect(env.messages[0].scope).toBeTruthy();
    expect(env.focused).toEqual(['age']);
    expect(env.fallback).toEqual([]);
  });

  it.each(['/index.html', '/docpro.html'])('%s confirms success only after the real save Promise settles', async route => {
    const env = environment({ route }), pending = deferred();
    env.win.VildaVault.savePatient.mockReturnValue(pending.promise);
    const result = env.save();
    await Promise.resolve();
    expect(env.messages.some(message => message.success === true)).toBe(false);
    pending.resolve({ patientId: 'fictional-first', snapshotCount: 3, savedAtISO: '2026-10-24T12:00:00.000Z', header: { name: env.payload.name } });
    expect(await result).toBe(env.payload);
    expect(env.messages).toContainEqual(expect.objectContaining({ success: true, ton: 'ok', patientId: 'fictional-first' }));
    expect(env.messages.find(message => message.success === true).scope).toBeTruthy();
    expect(env.fallback).toEqual([]);
    expect(env.events.find(event => event.type === 'vilda:patient-loaded').detail).toMatchObject({ source: 'save', applySequence: 0 });
  });

  it('a rejected save still resolves to the payload, keeps the error and permits retry', async () => {
    const env = environment();
    env.win.VildaVault.savePatient.mockRejectedValueOnce(new Error('Fikcyjna odmowa'));
    expect(await env.save()).toBe(env.payload);
    expect(env.messages.at(-1)).toMatchObject({ ton: 'blad', tekst: 'Nie udało się zapisać pacjenta: Fikcyjna odmowa' });
    expect(env.messages.at(-1).retry).toBeTypeOf('function');
    expect(env.win.VildaSaveStatusIndicator.notifySaveFailed).toHaveBeenCalledWith('Fikcyjna odmowa');
    expect(env.messages.some(message => message.success === true)).toBe(false);
    expect(env.fallback).toEqual([]);
    await env.messages.at(-1).retry();
    expect(env.win.VildaVault.savePatient).toHaveBeenCalledTimes(2);
    expect(env.messages.at(-1)).toMatchObject({ success: true });
  });

  it('the first save publishes its outcome after the normal loaded-event listener adopts the new ID', async () => {
    const env = environment({ patientId: null, adoptSavedPatient: true });
    await env.save();
    expect(env.storage.get('vildaCurrentPatientId')).toBe('fictional-created');
    expect(env.messages.at(-1)).toMatchObject({ success: true, ton: 'nowy', patientId: 'fictional-created' });
    expect(env.messages.at(-1).scope.patientId).toBeNull();
    expect(env.fallback).toEqual([]);
  });

  it('a cancelled save is information rather than success or a failed-record error', async () => {
    const env = environment();
    env.win.VildaVault.savePatient.mockRejectedValueOnce(Object.assign(new Error('Fikcyjne anulowanie'), { vildaSaveAborted: true }));
    expect(await env.save()).toBe(env.payload);
    expect(env.messages.at(-1)).toMatchObject({ ton: 'info', tekst: 'Zapis anulowany — nic nie zmieniono.' });
    expect(env.messages.some(message => message.success === true)).toBe(false);
    expect(env.win.VildaSaveStatusIndicator.notifySaveFailed).not.toHaveBeenCalled();
  });
});

describe('pending feedback belongs to the initiating form and operation', () => {
  it('rapid repeated saves share one in-flight operation, then a later deliberate save is allowed', async () => {
    const env = environment(), pending = deferred();
    env.win.VildaVault.savePatient.mockReturnValueOnce(pending.promise);
    const first = env.save(), second = env.save();
    expect(second).toBe(first);
    await Promise.resolve();
    expect(env.win.VildaVault.savePatient).toHaveBeenCalledTimes(1);
    pending.resolve({ patientId: 'fictional-first', snapshotCount: 2 });
    expect(await first).toBe(env.payload);
    expect(await second).toBe(env.payload);
    await env.save();
    expect(env.win.VildaVault.savePatient).toHaveBeenCalledTimes(2);
  });

  it('changing only the collector timestamp still shares the same pending save', async () => {
    const env = environment(), pending = deferred();
    const original = { ...payload(), timestampISO: '2026-10-24T12:00:00.000Z' };
    env.setPayload(original);
    env.win.VildaVault.savePatient.mockReturnValueOnce(pending.promise);
    const first = env.save();
    env.setPayload({ ...structuredClone(original), timestampISO: '2026-10-24T12:00:01.000Z' });
    const repeated = env.save();
    expect(repeated).toBe(first);
    await Promise.resolve();
    expect(env.win.VildaVault.savePatient).toHaveBeenCalledTimes(1);
    pending.resolve({ patientId: 'fictional-first', snapshotCount: 2 });
    expect(await first).toBe(original);
    expect(await repeated).toBe(original);
  });

  it('a changed payload without a DOM edit event is not swallowed by duplicate prevention', async () => {
    const env = environment(), firstWrite = deferred(), secondWrite = deferred();
    const original = env.payload, changed = structuredClone(original);
    changed.user.height = 137;
    env.win.VildaVault.savePatient.mockReturnValueOnce(firstWrite.promise).mockReturnValueOnce(secondWrite.promise);
    const first = env.save();
    await Promise.resolve();
    env.setPayload(changed);
    const second = env.save();
    await Promise.resolve();
    expect(second).not.toBe(first);
    expect(env.win.VildaVault.savePatient.mock.calls.map(([data]) => data.user.height)).toEqual([136, 137]);
    firstWrite.resolve({ patientId: 'fictional-first', snapshotCount: 2 });
    secondWrite.resolve({ patientId: 'fictional-first', snapshotCount: 3 });
    expect(await first).toBe(original);
    expect(await second).toBe(changed);
  });

  it('vault merging cannot mutate the captured duplicate key for an unchanged form', async () => {
    const env = environment(), pending = deferred();
    const originalForm = structuredClone(env.payload);
    env.win.VildaVault.savePatient.mockImplementationOnce(data => {
      // The real vault adds accepted history to its payload in place, while the
      // form still contains the original working visit until save completes.
      data.growthBasic = { data: { measurements: [{ ageMonths: 96, height: 130, weight: 25 }] } };
      return pending.promise;
    });
    const first = env.save();
    await Promise.resolve();
    env.setPayload(originalForm);
    const repeated = env.save();
    expect(repeated).toBe(first);
    expect(env.win.VildaVault.savePatient).toHaveBeenCalledTimes(1);
    pending.resolve({ patientId: 'fictional-first', snapshotCount: 2 });
    await first;
    expect(await repeated).toMatchObject({ growthBasic: { data: { measurements: [{ ageMonths: 96, height: 130, weight: 25 }] } } });
  });

  it('a deliberate edit during a slow save writes the new value and only the newer result is acknowledged', async () => {
    const env = environment(), firstWrite = deferred(), secondWrite = deferred(), written = [];
    const original = env.payload, changed = structuredClone(original);
    changed.user.height = 137;
    env.win.VildaVault.savePatient
      .mockImplementationOnce(async data => { await firstWrite.promise; written.push(structuredClone(data)); return { patientId: 'fictional-first', snapshotCount: 2 }; })
      .mockImplementationOnce(async data => { await secondWrite.promise; written.push(structuredClone(data)); return { patientId: 'fictional-first', snapshotCount: 3 }; });
    const first = env.save();
    await Promise.resolve();
    env.editPayload(changed);
    const second = env.save();
    await Promise.resolve();
    expect(second).not.toBe(first);
    expect(env.win.VildaVault.savePatient).toHaveBeenCalledTimes(2);
    env.messages.length = 0;
    firstWrite.resolve();
    expect(await first).toBe(original);
    expect(env.messages).toEqual([]);
    expect(env.win.VildaSaveStatusIndicator.notifySaveFailed).not.toHaveBeenCalled();
    secondWrite.resolve();
    expect(await second).toBe(changed);
    expect(written.map(data => data.user.height)).toEqual([136, 137]);
    expect(env.messages).toEqual([expect.objectContaining({ success: true, ton: 'ok' })]);
    expect(env.fallback).toEqual([]);
  });

  it('an old save error cannot replace the acknowledgement or error chip after a newer edited save', async () => {
    const env = environment(), firstWrite = deferred();
    env.win.VildaVault.savePatient.mockReturnValueOnce(firstWrite.promise);
    const first = env.save();
    await Promise.resolve();
    const changed = structuredClone(env.payload);
    changed.user.height = 137;
    env.editPayload(changed);
    await env.save();
    expect(env.messages.at(-1)).toMatchObject({ success: true });
    env.messages.length = 0;
    firstWrite.reject(new Error('Fikcyjny błąd poprzedniego pomiaru'));
    await first;
    expect(env.messages).toEqual([]);
    expect(env.fallback).toEqual([]);
    expect(env.win.VildaSaveStatusIndicator.notifySaveFailed).not.toHaveBeenCalled();
  });

  it.each(['patient', 'route', 'clear', 'lock', 'import'])('a late error after %s cannot replace current feedback or paint its chip red', async reason => {
    const env = environment(), pending = deferred();
    env.win.VildaVault.savePatient.mockReturnValue(pending.promise);
    const result = env.save();
    await Promise.resolve();
    env.messages.length = 0;
    env.invalidate(reason);
    pending.reject(new Error('Spóźniony fikcyjny błąd'));
    await result;
    expect(env.messages).toEqual([]);
    expect(env.fallback).toEqual([]);
    expect(env.win.VildaSaveStatusIndicator.notifySaveFailed).not.toHaveBeenCalled();
  });

  it('a late success after switching patients is consumed without reviving the old status strip', async () => {
    const env = environment(), pending = deferred();
    env.win.VildaVault.savePatient.mockReturnValue(pending.promise);
    const result = env.save();
    await Promise.resolve();
    env.messages.length = 0;
    env.invalidate('patient');
    pending.resolve({ patientId: 'fictional-first', snapshotCount: 2 });
    await result;
    expect(env.messages).toEqual([]);
    expect(env.fallback).toEqual([]);
  });
});

describe('unrelated callers retain the existing fallback behavior', () => {
  it('without the overlay module the existing status bar receives save feedback', async () => {
    const env = environment({ feedback: false });
    expect(await env.save()).toBe(env.payload);
    expect(env.fallback.at(-1)).toMatchObject({ ton: 'ok' });
    expect(env.messages).toEqual([]);
  });

  it('a module loaded outside Start/DocPro does not coalesce other pages’ saves', async () => {
    const env = environment({ route: '/kalkulator-klirens.html' }), pending = deferred();
    env.win.VildaVault.savePatient.mockReturnValue(pending.promise);
    const first = env.save(), second = env.save();
    await Promise.resolve();
    expect(env.win.VildaVault.savePatient).toHaveBeenCalledTimes(2);
    pending.resolve({ patientId: 'fictional-first', snapshotCount: 2 });
    await Promise.all([first, second]);
    expect(env.messages).toEqual([]);
    expect(env.fallback).toHaveLength(2);
  });

  it('JSON import errors still use the import feedback path, not a save confirmation', async () => {
    const env = environment();
    env.win.VildaDataImportExport.handleFile(null, {
      file: { name: 'fikcyjny.json', type: 'application/json', size: 4 },
      readFileAsText: () => Promise.resolve('{bad'),
      applyLoadedData() {},
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(env.messages).toEqual([]);
    expect(env.fallback).toContainEqual(expect.objectContaining({ ton: 'blad', tekst: 'Nieprawidłowy plik JSON.' }));
  });
});
