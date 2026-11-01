import { afterEach, describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
const devices = [];
const clone = value => JSON.parse(JSON.stringify(value));
let serial = 0;
const storage = () => { const map = new Map(); return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key), key: index => [...map.keys()][index] ?? null, get length() { return map.size; } }; };
async function device() {
  const win = { crypto, TextEncoder, TextDecoder, btoa, atob, localStorage: storage(), sessionStorage: storage(), setTimeout, clearTimeout,
    addEventListener() {}, removeEventListener() {}, document: { hidden: false, addEventListener() {}, removeEventListener() {} } };
  win.window = win; win.self = win; win.top = win;
  for (const file of ['vilda_crypto.js', 'vilda_clinical_crypto.js', 'vilda_patient_checkpoint_store.js',
    'vilda_patient_checkpoint.js', 'vilda_care_template_model.js', 'vilda_care_template_store.js', 'vilda_vault.js']) loadBrowserScript(file, win);
  const vault = win.VildaVault; vault.setEphemeralMode(true); const adapter = vault.createInMemoryAdapter(); vault.setStorageAdapter(adapter);
  const password = 'Fictional#TemplateSession!' + ++serial;
  await vault.createUser(password, { iterations: 1000, label: 'Fikcyjny sejf biblioteki', deferServerContact: true }); devices.push(vault);
  return { win, vault, adapter, password, userId: vault.getCurrentUser().userId };
}
afterEach(() => devices.splice(0).forEach(vault => vault.lock('fictional-template-session-finished')));

describe('actual template vault session and key lifecycle fences', () => {
  it('does not share deferred HKDF context or rejection across two accounts', async () => {
    const d = await device(), first = d.userId;
    d.vault.lock('fictional-second-account'); d.vault.setEphemeralMode(true); d.vault.setStorageAdapter(d.adapter); const secondPassword = 'Fictional#OtherTemplate!' + ++serial;
    await d.vault.createUser(secondPassword, { iterations: 1000, label: 'Fikcyjne drugie konto', deferServerContact: true }); const second = d.vault.getCurrentUser().userId;
    d.vault.lock('fictional-first-account'); d.vault.setEphemeralMode(true); d.vault.setStorageAdapter(d.adapter); await d.vault.unlockUser(first, d.password);
    let release, reached; const gate = new Promise(resolve => { reached = resolve; }), held = new Promise(resolve => { release = resolve; }); let once = false;
    const original = d.win.crypto;
    d.win.crypto = { getRandomValues: original.getRandomValues.bind(original), subtle: new Proxy(original.subtle, { get(target, property) {
      if (property === 'deriveBits') return async (...args) => { const value = await target.deriveBits(...args); if (!once) { once = true; reached(); await held; } return value; };
      const value = target[property]; return typeof value === 'function' ? value.bind(target) : value;
    } }) };
    const old = d.vault.captureCareTemplateSession().then(value => ({ value }), error => ({ error })); await gate;
    d.vault.lock('fictional-switch-during-HKDF'); d.vault.setEphemeralMode(true); d.vault.setStorageAdapter(d.adapter); await d.vault.unlockUser(second, secondPassword);
    const next = await d.vault.captureCareTemplateSession(); expect(next.userId).toBe(second); release();
    expect((await old).error).toMatchObject({ code: 'SESSION_CHANGED' }); expect(await d.vault.captureCareTemplateSession()).toBe(next); expect(d.vault.assertCareTemplateSession(next)).toBe(true);
  });
  it('refuses missing and initialized protected identity authority before replacing sync credentials', async () => {
    const d = await device(), before = clone(await d.adapter.getUserMeta(d.userId));
    await expect(d.vault.rotateSyncIdentity(d.password)).rejects.toMatchObject({ code: 'CARE_TEMPLATE_AUTHORITY_UNAVAILABLE' }); expect(await d.adapter.getUserMeta(d.userId)).toEqual(before);
    const material = await d.vault.getSyncMaterial(); d.win.VildaSync = { inspectTemplateLibraryAuthority: async () => ({ initialized: true, epoch: 1, eventsStored: 0, bytesStored: 0, slotId: material.slotId }) };
    await expect(d.vault.rotateSyncIdentity(d.password)).rejects.toMatchObject({ code: 'CARE_TEMPLATE_IDENTITY_PROTECTED' }); expect(await d.adapter.getUserMeta(d.userId)).toEqual(before);
  });
  it('allows proven empty identity rotation and invalidates the old slot token while retaining DEK binding', async () => {
    const d = await device(), token = await d.vault.captureCareTemplateSession(), material = await d.vault.getSyncMaterial();
    d.win.VildaSync = { inspectTemplateLibraryAuthority: async () => ({ initialized: false, epoch: 0, eventsStored: 0, bytesStored: 0, slotId: material.slotId }) };
    expect((await d.vault.rotateSyncIdentity(d.password)).recoveryKey).toBeTruthy();
    expect(() => d.vault.assertCareTemplateSession(token)).toThrow(); const next = await d.vault.captureCareTemplateSession(); expect(next.keyBinding).toBe(token.keyBinding); expect(next.slotId).not.toBe(token.slotId);
  });
  it('keeps the same encrypted library identity across a verified same-DEK password rewrap', async () => {
    const d = await device(), token = await d.vault.captureCareTemplateSession();
    expect(await d.vault.changePassword(d.password, 'Fictional#NewTemplatePassword!' + ++serial)).toBe(true); expect(d.vault.assertCareTemplateSession(token)).toBe(true); expect((await d.vault.captureCareTemplateSession()).keyBinding).toBe(token.keyBinding);
  });
  it('does not rewrap a foreign DEK under a new password while the current key is still active', async () => {
    const d = await device(), meta = clone(await d.adapter.getUserMeta(d.userId)), key = await d.win.VildaCrypto.deriveKey(d.password, meta.passwordSalt, meta.passwordKdfIterations || meta.kdfIterations);
    const foreign = d.win.VildaCrypto.generateMasterKeyBytes(), cipher = await d.win.VildaCrypto.encryptBytes(key, foreign);
    await d.adapter.putUserMeta(d.userId, { ...meta, encryptedMasterByPassword: { iv: d.win.VildaCrypto.bytesToBase64(cipher.iv), data: d.win.VildaCrypto.bytesToBase64(cipher.data) } });
    const before = clone(await d.adapter.getUserMeta(d.userId));
    await expect(d.vault.changePassword(d.password, 'Fictional#RejectForeignKey!' + ++serial)).rejects.toMatchObject({ code: 'CARE_TEMPLATE_KEY_CHANGED' }); expect(await d.adapter.getUserMeta(d.userId)).toEqual(before);
  });
  it('captures a readonly sync fence without modules, metadata reads or authoring capability', async () => {
    const d = await device(); delete d.win.VildaCareTemplateModel; delete d.win.VildaCareTemplateStore;
    let reads = 0; d.vault.setStorageAdapter(new Proxy(d.adapter, { get(target, property) { const value = target[property]; return typeof value === 'function' ? (...args) => { reads++; return value.apply(target, args); } : value; } }));
    const token = d.vault.captureSyncOperationSession(); expect(d.vault.assertSyncOperationSession(token)).toBe(true); expect(reads).toBe(0);
    expect(() => d.vault.assertCareTemplateSession(token)).toThrow(); expect(() => d.vault.assertSyncOperationSession({})).toThrow();
    d.vault.lock('fictional-sync-request-lock'); expect(() => d.vault.assertSyncOperationSession(token)).toThrow();
    const locked = d.vault.captureSyncOperationSession(); expect(d.vault.assertSyncOperationSession(locked)).toBe(true);
    d.vault.setEphemeralMode(true); d.vault.setStorageAdapter(d.adapter); await d.vault.unlockUser(d.userId, d.password); expect(() => d.vault.assertSyncOperationSession(locked)).toThrow();
  });
  it('retains an account key when an existing protected database has a newer unknown schema', async () => {
    const d = await device(), token = await d.vault.captureCareTemplateSession(), before = clone(await d.adapter.getUserMeta(d.userId)); let closed = 0, scans = 0;
    d.win.indexedDB = { async databases() { return [{ name: 'vilda_template_library_v1_' + token.keyBinding, version: 2 }]; }, open(name) {
      if (name === 'clinical-authority-checkpoints-v1') {
        // The separate checkpoint domain is absent in this library-only test.
        // Its real reader aborts creation before reaching the retained library.
        const request = { error: { name: 'AbortError' }, transaction: {
          abort() { queueMicrotask(() => request.onerror()); }
        } };
        queueMicrotask(() => request.onupgradeneeded({ oldVersion: 0 }));
        return request;
      }
      const request = { result: { version: 2, objectStoreNames: { contains() { return true; } }, close() { closed++; }, transaction() { scans++; const tx = { objectStore(name) { return name === 'meta' ? { get() { return { result: { ownerUserIds: [d.userId] } }; } } : { count() { return { result: 0 }; } }; } }; queueMicrotask(() => tx.oncomplete()); return tx; } } };
      queueMicrotask(() => request.onsuccess()); return request;
    } };
    await expect(d.vault.removeUser(d.userId, d.password)).rejects.toMatchObject({ code: 'CARE_TEMPLATE_LIBRARY_RETAINED' }); expect(scans).toBe(0); expect(closed).toBe(1); expect(await d.adapter.getUserMeta(d.userId)).toEqual(before); expect(d.vault.getCurrentUser().userId).toBe(d.userId);
  });
  it('does not claim the existing account backup contains the separate template library', async () => {
    const d = await device(); expect(await d.vault.getVaultBackupScope()).toMatchObject({ includesCareTemplateLibrary: false, format: 'legacy-v1' });
    expect((await d.vault.getCarePlanTemplateCapability()).maxImportBytes).toBe(d.vault.CARE_TEMPLATE_BACKUP_MAX_BYTES);
  });
});
