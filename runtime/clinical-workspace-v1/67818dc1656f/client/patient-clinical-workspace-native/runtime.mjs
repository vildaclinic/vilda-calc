// Private orchestration between the authenticated workspace client and native
// vault functions. A caller-supplied DTO is never an admission credential.
// The vault owns this instance, its genuine client and its session callbacks.
import { createNativeStage, nativeError } from './adapter.mjs';

export function createNativeWorkspaceRuntime(options) {
  const { accountId, accountBinding, client, codec, legacyAdapter, encrypt, decrypt,
    assertCurrent, withLock, newId, clock, validateCareCommit, validateReminderCommit, onCommitted,
    isPatientVisible, isDocumentVisible, checkLegacy } = options;
  if (typeof accountId !== 'string' || typeof accountBinding !== 'string'
    || !client || !codec || !legacyAdapter
    || ['encrypt', 'decrypt', 'assertCurrent', 'withLock', 'newId', 'clock'].some(name => typeof options[name] !== 'function')) throw nativeError('INVALID');
  let queue = Promise.resolve(), closed = false, active = null, revision = null, source = null, image = null, legacyDiverged = false;
  const wrappers = new Map();
  function check() { if (closed) throw nativeError('CLOSED'); assertCurrent(); }
  async function auditLegacy() {
    if (typeof checkLegacy === 'function') {
      const unchanged = await checkLegacy(); check();
      if (unchanged !== true) legacyDiverged = true;
    }
    return !legacyDiverged;
  }
  function statusWithLegacy(status) {
    return legacyDiverged ? { ...status, localWriteAvailable: false, legacyDiverged: true,
      conflictCount: (status.conflictCount || 0) + 1 } : status;
  }
  const adapter = new Proxy(Object.create(null), {
    get(_, property) {
      if (property === '__vildaProtectedAdapter') return true;
      if (property === 'then') return undefined;
      if (typeof property !== 'string') return undefined;
      if (!wrappers.has(property)) wrappers.set(property, function (...args) {
        check();
        if (!active || typeof active.adapter[property] !== 'function') throw nativeError('OPERATION_REQUIRED');
        return active.adapter[property](...args);
      });
      return wrappers.get(property);
    },
    set() { throw nativeError('INVALID'); }, defineProperty() { throw nativeError('INVALID'); }, deleteProperty() { throw nativeError('INVALID'); }
  });
  async function refreshProjection() {
    check();
    if (image && revision !== null) {
      const status = await client.readStatus(); check();
      if (status?.bootstrapRequired !== false) throw nativeError('NOT_READY');
      if (status?.revision === revision) return { revision, status };
    }
    const current = await client.readCurrent(); check();
    if (!current || !Number.isSafeInteger(current.revision) || current.revision < 1 || !current.source
      || current.status?.bootstrapRequired !== false) throw nativeError('NOT_READY');
    if (current.revision !== revision || !image) {
      const decoded = await codec.verifyWorkspaceSource(current.source); check();
      if (decoded.accountBinding !== accountBinding) throw nativeError('ACCOUNT_CHANGED');
      const projected = await codec.reprojectWorkspaceSource(current.source, { encrypt, assertCurrent: check }); check();
      if (projected.accountBinding !== accountBinding) throw nativeError('ACCOUNT_CHANGED');
      source?.bytes?.fill(0); source = current.source; image = projected; revision = current.revision;
    }
    return current;
  }
  function enqueue(action) {
    check();
    const pending = queue.then(() => withLock(async () => { check(); return action(); }));
    queue = pending.catch(() => {});
    return pending;
  }
  async function operation(operationId, action, lease) {
    if (typeof operationId !== 'string' || !/^[A-Za-z0-9_.-]{1,160}$/.test(operationId) || typeof action !== 'function') throw nativeError('INVALID');
    const perform = async () => {
      await refreshProjection(); check();
      const expectedRevision = revision;
      const stage = createNativeStage({ accountId, image, assertCurrent: check, legacyAdapter, encrypt, decrypt,
        clock, validateCareCommit, validateReminderCommit, isPatientVisible, isDocumentVisible });
      let committed = false, result;
      active = stage;
      try {
        result = await action(stage.transaction); check();
        let nextImage = null, nextSource = null;
        if (stage.changed) {
          if (!await auditLegacy()) throw nativeError('LEGACY_DIVERGED');
          nextImage = stage.image();
          const { carePlansV2, ...rawImage } = nextImage;
          nextSource = await codec.captureWorkspaceSource({ readNativeImage: async () => rawImage,
            decrypt, assertCurrent: check, previousSource: source, carePlansV2 }); check();
          // The client resolves only after one completed local source+outbox
          // CAS transaction and cryptographic readback. Do not emit before it.
          const retained = await client.prepareWrite({ operationId, expectedRevision, source: nextSource });
          committed = true;
          if (!retained || retained.operationId !== operationId || !Number.isSafeInteger(retained.revision)) throw nativeError('UNCONFIRMED');
          source?.bytes?.fill(0); source = nextSource; image = nextImage; revision = retained.revision;
        }
        const completion = stage.finish(); active = null;
        if (completion.metadataAfterCommit) {
          check(); await legacyAdapter.putUserMeta(accountId, completion.metadataAfterCommit); check();
        }
        for (const event of completion.events) { check(); try { event(); } catch { /* Native listeners are isolated. */ } }
        if (committed && typeof onCommitted === 'function') { check(); onCommitted({ operationId, revision }); }
        return result;
      } catch (error) {
        stage.abort();
        // Never continue from an unverified in-memory candidate after failure,
        // including a native transaction that committed but lost its reply.
        source?.bytes?.fill(0); image = null; source = null; revision = null;
        if (committed) throw Object.assign(nativeError('UNCONFIRMED'), { operationId, outcome: 'unknown' });
        throw error;
      } finally { active = null; }
    };
    return enqueue(() => lease ? lease(perform) : perform());
  }
  return Object.freeze({
    adapter,
    transact: operation,
    read(action) { return operation(newId(), action); },
    runNative(action) { return operation(newId(), action); },
    async ready() { return enqueue(async () => { await auditLegacy(); await refreshProjection(); return true; }); },
    defer(event) {
      check(); if (!active) return false;
      active.defer(event); return true;
    },
    assertActive() { check(); if (!active) throw nativeError('OPERATION_REQUIRED'); return true; },
    inspectActive(action) { check(); if (!active || typeof action !== 'function') throw nativeError('OPERATION_REQUIRED'); return action(active.transaction); },
    async status() { check(); const result = await client.readStatus(); check(); return statusWithLegacy(result); },
    // Only the native recovery coordinator calls this while already holding
    // the account operation lock. Do not enqueue and reacquire that lock.
    async auditStatus() { check(); await auditLegacy(); const result = await client.readStatus(); check(); return statusWithLegacy(result); },
    async getCapability() {
      check(); const status = await client.readStatus(); check();
      const available = !legacyDiverged && status?.localWriteAvailable === true && !status.bootstrapRequired && !status.conflictCount;
      return { available, message: available ? '' : 'Najpierw zakończ przygotowanie lub uzgodnij zmiany danych pacjentów.' };
    },
    async flush() { return enqueue(async () => { if (!await auditLegacy()) throw nativeError('LEGACY_DIVERGED'); const result = await client.flush(); check(); image = null; return result; }); },
    async refresh() { return enqueue(async () => { if (!await auditLegacy()) throw nativeError('LEGACY_DIVERGED'); const result = await client.refresh(); check(); image = null; return result; }); },
    conflictOperation(action) {
      if (typeof action !== 'function') throw nativeError('INVALID');
      return enqueue(async () => {
        if (!await auditLegacy()) throw nativeError('LEGACY_DIVERGED');
        try {
          const result = await action(client); check();
          if (result?.resolved && typeof onCommitted === 'function') onCommitted({ conflictResolved: true });
          return result;
        } finally { source?.bytes?.fill(0); source = null; image = null; revision = null; }
      });
    },
    close() { closed = true; active?.abort(); active = null; image = null; source?.bytes?.fill(0); source = null; revision = null; client.close(); }
  });
}
