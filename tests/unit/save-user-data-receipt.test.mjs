import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const payload = () => ({ version: 1, name: 'Fikcyjny Test Potwierdzenia', user: { sex: 'M', age: 12, height: 145, weight: 35 } });
function fixture(save = async () => ({ patientId: 'fictional-saved', snapshotId: 'fictional-snapshot' })) {
  let generation = 1, unlocked = true, owner = 'fictional-owner'; const savedListeners = [];
  const vault = { isUnlocked: () => unlocked, getCurrentUser: () => ({ userId: owner }), onPatientSaved: fn => savedListeners.push(fn),
    captureSyncOperationSession: () => ({ generation }), assertSyncOperationSession(token) { if (token.generation !== generation) throw Object.assign(new Error('Changed'), { code: 'SESSION_CHANGED' }); return true; },
    savePatient: vi.fn(save) };
  const win = { VildaVault: vault, location: { pathname: '/index.html' },
    document: { readyState: 'loading', getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, dispatchEvent() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} }, setTimeout: () => 0, clearTimeout() {}, addEventListener() {},
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    VildaSaveFeedback: { capture: () => ({ generation }), isCurrent: scope => scope.generation === generation, show() {} } };
  loadBrowserScript('vilda_data_import_export.js', win);
  const options = { collectUserData: payload };
  return { win, vault, api: win.VildaDataImportExport, options,
    lock() { unlocked = false; generation++; }, changeOwner() { owner = 'fictional-other'; generation++; },
    foreignAck() { savedListeners.forEach(fn => fn({ patientId: 'foreign', snapshotId: 'foreign-snapshot' })); } };
}

describe('save receipt belongs to the actual save operation', () => {
  it('returns the own committed patient/snapshot while preserving the old payload return', async () => {
    const h = fixture(), receipt = await h.api.saveUserDataWithReceipt(h.options);
    expect(receipt).toMatchObject({ saved: true, patientId: 'fictional-saved', snapshotId: 'fictional-snapshot' });
    expect(await h.api.saveUserData(h.options)).toEqual(payload()); expect(h.vault.savePatient).toHaveBeenCalledTimes(2);
  });

  it.each([
    Object.assign(new Error('Fikcyjny błąd'), { code: 'QUOTA' }),
    Object.assign(new Error('Fikcyjna odmowa'), { vildaSaveAborted: true }),
    Object.assign(new Error('Fikcyjna zmiana sesji'), { code: 'SESSION_CHANGED' }),
    Object.assign(new Error('Fikcyjny zapis zajęty'), { vildaSaveBusy: true })
  ])('settles false after handled failure instead of accepting the resolved payload: %s', async error => {
    const h = fixture(async () => { throw error; });
    expect(await h.api.saveUserDataWithReceipt(h.options)).toMatchObject({ saved: false });
    expect(await h.api.saveUserData(h.options)).toEqual(payload());
  });

  it.each(['blank', 'locked', 'guest'])('settles an early %s null without a save', async reason => {
    const h = fixture(); if (reason === 'blank') h.options.collectUserData = () => ({ name: '', user: {} });
    if (reason === 'locked') h.lock(); if (reason === 'guest') h.win.VildaGuestMode = true;
    expect(await h.api.saveUserDataWithReceipt(h.options)).toMatchObject({ saved: false }); expect(h.vault.savePatient).not.toHaveBeenCalled();
    expect(h.api.saveUserData(h.options)).toBeNull();
  });

  it.each(['lock', 'owner', 'apply'])('does not authorize clear after %s changes while its own save is pending', async change => {
    let resolve; const h = fixture(() => new Promise(done => { resolve = done; }));
    const receipt = h.api.saveUserDataWithReceipt(h.options); await Promise.resolve();
    if (change === 'lock') h.lock(); if (change === 'owner') h.changeOwner();
    if (change === 'apply') h.api.applyLoadedData(payload(), { syncSharedUserDataFromLoadedData() {} });
    resolve({ patientId: 'fictional-saved', snapshotId: 'fictional-snapshot' });
    expect(await receipt).toMatchObject({ saved: false });
  });

  it('ignores a foreign save ACK and reuses only the deduplicated own operation receipt', async () => {
    let resolve; const h = fixture(() => new Promise(done => { resolve = done; }));
    const first = h.api.saveUserDataWithReceipt(h.options), second = h.api.saveUserDataWithReceipt(h.options);
    await Promise.resolve(); let settled = false; first.then(() => { settled = true; }); h.foreignAck(); await Promise.resolve();
    expect(settled).toBe(false); expect(h.vault.savePatient).toHaveBeenCalledTimes(1);
    resolve({ patientId: 'fictional-own-new-patient', snapshotId: 'fictional-own-snapshot' });
    expect(await first).toMatchObject({ saved: true, patientId: 'fictional-own-new-patient' }); expect(await second).toEqual(await first);
  });

  it.each(['regular', 'receipt'])('tracks a real %s save immediately, before any indicator debounce or clicked state', async mode => {
    let resolve; const h = fixture(() => new Promise(done => { resolve = done; }));
    const save = mode === 'regular' ? h.api.saveUserData(h.options) : h.api.saveUserDataWithReceipt(h.options);
    expect(h.api.isSaveUserDataPending()).toBe(true); await Promise.resolve();
    resolve({ patientId: 'fictional-own', snapshotId: 'fictional-snapshot' }); await save;
    expect(h.api.isSaveUserDataPending()).toBe(false);
  });

  it('an old owner pending/finally cannot block or clear the new owner pending save', async () => {
    const releases = []; const h = fixture(() => new Promise(resolve => { releases.push(resolve); }));
    const old = h.api.saveUserDataWithReceipt(h.options); await Promise.resolve(); expect(h.api.isSaveUserDataPending()).toBe(true);
    h.changeOwner(); expect(h.api.isSaveUserDataPending()).toBe(false);
    const next = h.api.saveUserDataWithReceipt(h.options); await Promise.resolve(); expect(h.api.isSaveUserDataPending()).toBe(true);
    releases[0]({ patientId: 'fictional-old' }); expect(await old).toMatchObject({ saved: false }); expect(h.api.isSaveUserDataPending()).toBe(true);
    releases[1]({ patientId: 'fictional-new' }); expect(await next).toMatchObject({ saved: true, patientId: 'fictional-new' }); expect(h.api.isSaveUserDataPending()).toBe(false);
  });

  it('does not publish an old durable save return into the new owner UI, baseline or patient ID', async () => {
    let release; const h = fixture(() => new Promise(resolve => { release = resolve; }));
    const operation = h.api.saveUserDataWithReceipt(h.options); await Promise.resolve();
    h.changeOwner(); const current = { name: 'Fikcyjny Nowy Kontekst', user: { firstName: 'Nowa' } };
    h.win.lastLoadedData = current;
    const storage = new Map(), flush = vi.fn(), published = vi.fn(event => {
      if (event.type === 'vilda:patient-loaded') storage.set('vildaCurrentPatientId', event.detail.patientId);
    });
    h.win.sessionStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
    h.win.vildaPersistFlushNow = flush; h.win.document.dispatchEvent = published;
    release({ patientId: 'fictional-OLD-durable', snapshotId: 'fictional-OLD-snapshot' });
    expect(await operation).toMatchObject({ saved: false });
    expect(h.win.lastLoadedData).toBe(current); expect(storage.get('vildaCurrentPatientId')).toBeUndefined(); expect(published).not.toHaveBeenCalled(); expect(flush).not.toHaveBeenCalled();
  });

  it('does not invoke the vault with an old payload if owner changes before the queued save starts', async () => {
    const h = fixture(), operation = h.api.saveUserDataWithReceipt(h.options); h.changeOwner();
    expect(await operation).toMatchObject({ saved: false }); expect(h.vault.savePatient).not.toHaveBeenCalled();
  });

  it('does not reuse old-owner dedup even if the optional feedback scope still claims current', async () => {
    const releases = [], h = fixture(() => new Promise(resolve => { releases.push(resolve); }));
    h.win.VildaSaveFeedback.isCurrent = () => true;
    const first = h.api.saveUserDataWithReceipt(h.options); await Promise.resolve(); h.changeOwner();
    const second = h.api.saveUserDataWithReceipt(h.options); await Promise.resolve(); expect(h.vault.savePatient).toHaveBeenCalledTimes(2);
    releases[0]({ patientId: 'fictional-old' }); expect(await first).toMatchObject({ saved: false }); expect(h.api.isSaveUserDataPending()).toBe(true);
    releases[1]({ patientId: 'fictional-new' }); expect(await second).toMatchObject({ saved: true, patientId: 'fictional-new' });
  });

  it('ignores an old owner lock-wait callback even when feedback still claims current', async () => {
    let release; const h = fixture(() => new Promise(resolve => { release = resolve; }));
    h.win.VildaSaveFeedback.isCurrent = () => true; h.win.VildaSaveFeedback.show = vi.fn();
    const operation = h.api.saveUserDataWithReceipt(h.options); await Promise.resolve();
    const onLockWait = h.vault.savePatient.mock.calls[0][1].onLockWait;
    h.changeOwner(); h.win.VildaSaveFeedback.show.mockClear(); onLockWait();
    expect(h.win.VildaSaveFeedback.show).not.toHaveBeenCalled();
    release({ patientId: 'fictional-old' }); expect(await operation).toMatchObject({ saved: false });
  });

  it('ignores an old owner rejection before failure UI or patient deletion side effects', async () => {
    let reject; const h = fixture(() => new Promise((_, fail) => { reject = fail; }));
    h.win.VildaSaveFeedback.isCurrent = () => true; h.win.VildaSaveFeedback.show = vi.fn();
    h.win.VildaSaveStatusIndicator = { notifySaveFailed: vi.fn() };
    const operation = h.api.saveUserDataWithReceipt(h.options); await Promise.resolve(); h.changeOwner();
    const storage = new Map([['vildaCurrentPatientId', 'fictional-new-owner-patient']]);
    h.win.sessionStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
    h.win._vildaCurrentPatientId = 'fictional-new-owner-patient'; h.win.VildaSaveFeedback.show.mockClear();
    reject(Object.assign(new Error('Fikcyjna stara odmowa'), { code: 'PATIENT_DELETED', patientId: 'fictional-new-owner-patient' }));
    expect(await operation).toMatchObject({ saved: false });
    expect(h.win._vildaCurrentPatientId).toBe('fictional-new-owner-patient'); expect(storage.get('vildaCurrentPatientId')).toBe('fictional-new-owner-patient');
    expect(h.win.VildaSaveFeedback.show).not.toHaveBeenCalled(); expect(h.win.VildaSaveStatusIndicator.notifySaveFailed).not.toHaveBeenCalled();
  });
});
