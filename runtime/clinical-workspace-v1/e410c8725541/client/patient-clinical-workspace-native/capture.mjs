// Complete native capture for the chunked workspace bootstrap. Authentication
// metadata stays in its existing account domain; every clinical store and
// snapshot shadow is copied in one completed readonly IDB transaction.
import { STORE_KEYS, selectClinicalMetadata, nativeError } from './adapter.mjs';
const ALL_STORES = ['meta', ...Object.keys(STORE_KEYS)].sort();
export async function readNativeWorkspaceImage({ indexedDB, name, accountId, accountBinding, assertCurrent, registerCleanup }) {
  if (!indexedDB || typeof indexedDB.open !== 'function' || name !== 'vilda_user_' + accountId
    || typeof accountId !== 'string' || !/^[a-f0-9]{32}$/.test(accountId)
    || typeof accountBinding !== 'string' || typeof assertCurrent !== 'function' || typeof registerCleanup !== 'function') throw nativeError('INVALID');
  let database = null, request = null, transaction = null, stopped = null, timer = null, rejectRead;
  const image = { accountBinding, databaseVersion: null,
    stores: Object.keys(STORE_KEYS).sort().map(store => ({ name: store, records: [] })),
    clinicalMeta: null, shadows: [] };
  const stores = new Map(image.stores.map(store => [store.name, store]));
  function check() { if (stopped) throw stopped; assertCurrent(); }
  function cancel(error = nativeError('CLOSED')) {
    if (!stopped) stopped = error;
    try { transaction?.abort(); } catch { /* Completed readonly snapshot. */ }
    try { request?.transaction?.abort(); } catch { /* No upgrade in progress. */ }
    try { database?.close(); } catch { /* Already closed. */ }
    rejectRead?.(stopped);
  }
  const unregister = registerCleanup(cancel);
  if (typeof unregister !== 'function') throw nativeError('INVALID');
  try {
    check();
    const result = new Promise((resolve, reject) => {
      rejectRead = reject;
      timer = setTimeout(() => cancel(nativeError('BLOCKED')), 10000);
      try { request = indexedDB.open(name); } catch { cancel(nativeError('STORAGE')); return; }
      request.onblocked = () => cancel(nativeError('BLOCKED'));
      request.onerror = () => cancel(nativeError('STORAGE'));
      request.onupgradeneeded = () => cancel(nativeError('NOT_READY'));
      request.onsuccess = () => {
        database = request.result;
        try {
          check();
          if (database.name !== name || database.version !== 5
            || JSON.stringify([...database.objectStoreNames].sort()) !== JSON.stringify(ALL_STORES)) throw nativeError('UNSUPPORTED');
          image.databaseVersion = database.version;
          database.onversionchange = () => cancel(nativeError('CLOSED'));
          transaction = database.transaction(ALL_STORES, 'readonly');
          transaction.onabort = transaction.onerror = () => cancel(nativeError('STORAGE'));
          transaction.oncomplete = () => {
            try { check(); if (!image.clinicalMeta) throw nativeError('CORRUPT'); resolve(image); }
            catch (error) { cancel(error); }
          };
          for (const storeName of ALL_STORES) {
            const store = transaction.objectStore(storeName), indexed = ['patientNotes', 'snapshots'].includes(storeName);
            if (store.keyPath !== (storeName === 'meta' ? 'id' : STORE_KEYS[storeName]) || store.autoIncrement
              || JSON.stringify([...store.indexNames].sort()) !== JSON.stringify(indexed ? ['byPatient'] : [])) throw nativeError('UNSUPPORTED');
            if (indexed) {
              const index = store.index('byPatient');
              if (index.keyPath !== 'patientId' || index.unique || index.multiEntry) throw nativeError('UNSUPPORTED');
            }
            const cursor = store.openCursor();
            cursor.onerror = () => cancel(nativeError('STORAGE'));
            cursor.onsuccess = () => {
              try {
                check(); const row = cursor.result; if (!row) return;
                const key = row.key, value = row.value;
                if (typeof key !== 'string' || !key || key.length > 512 || !value || typeof value !== 'object') throw nativeError('CORRUPT');
                if (storeName !== 'meta') {
                  if (value[STORE_KEYS[storeName]] !== key) throw nativeError('CORRUPT');
                  stores.get(storeName).records.push({ key, value: structuredClone(value) });
                } else if (key === 'singleton') {
                  if (value.id !== key || value.userId !== accountId || value.schemaVersion !== 2 || image.clinicalMeta) throw nativeError('CORRUPT');
                  image.clinicalMeta = { key, value: selectClinicalMetadata(value) };
                } else if (key.startsWith('cien:') && value.id === key) image.shadows.push({ key, value: structuredClone(value) });
                else throw nativeError('UNSUPPORTED');
                row.continue();
              } catch (error) { cancel(error); }
            };
          }
        } catch (error) { cancel(error); }
      };
    });
    const captured = await result; check(); return captured;
  } finally {
    clearTimeout(timer); unregister(); rejectRead = null;
    try { database?.close(); } catch { /* Already closed. */ }
  }
}
