import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Read the complete public projection and every original user DB store/key.
 * `meta` also contains encrypted snapshot tombstones and clinical shadow rows;
 * it is therefore included in full alongside patient, note and snapshot stores.
 * No decrypt/re-encrypt or application mutation is used by this observer.
 */
export async function captureColdUpgradeRecords(owner, ids, { includeNotes = false } = {}) {
  const observed = await owner.evaluate(async ({ patientIds, includeNotes }) => {
    // Preserve types and all bytes before Playwright/JSON serialization. In the
    // actual vault iv/data are base64 strings; this also fails safely if a later
    // schema stores binary values or an unsupported structured-clone type.
    const encode = value => {
      if (value === null) return ['null'];
      if (value === undefined) return ['undefined'];
      if (typeof value === 'string' || typeof value === 'boolean') return [typeof value, value];
      if (typeof value === 'number') return ['number', Object.is(value, -0) ? '-0' : String(value)];
      if (value instanceof ArrayBuffer) return ['ArrayBuffer', Array.from(new Uint8Array(value))];
      if (ArrayBuffer.isView(value)) return [value.constructor.name,
        Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))];
      if (value instanceof Date) return ['Date', value.toISOString()];
      if (Array.isArray(value)) return ['Array', value.map(encode)];
      if (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) {
        return ['Object', Object.entries(value).map(([key, item]) => [key, encode(item)])];
      }
      throw Error('Unsupported raw clinical storage value: ' + Object.prototype.toString.call(value));
    };
    const records = await Promise.all(patientIds.map(async id => {
      const patient = await window.VildaVault.getPatient(id);
      return includeNotes ? { patient, notes: await window.VildaVault.listPatientNotesForPatient(id) } : patient;
    }));
    const name = window.VildaVault.USER_DB_PREFIX + window.VildaVault.getCurrentUser().userId;
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onupgradeneeded = () => { request.transaction.abort(); reject(Error('Read observer must not create the patient database')); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const names = [...database.objectStoreNames].sort();
      const transaction = database.transaction(names, 'readonly');
      const read = request => new Promise((resolve, reject) => {
        request.onsuccess = () => {
          try { resolve(request.result.map(encode)); } catch (error) { reject(error); }
        };
        request.onerror = () => reject(request.error);
      });
      const rows = await Promise.all(names.map(async name => {
        const store = transaction.objectStore(name);
        const [values, keys] = await Promise.all([read(store.getAll()), read(store.getAllKeys())]);
        return { name, values, keys };
      }));
      return { records, rawClinicalStorage: { name, version: database.version,
        stores: Object.fromEntries(rows.map(row => [row.name, row.values])),
        keys: Object.fromEntries(rows.map(row => [row.name, row.keys])) } };
    } finally { database.close(); }
  }, { patientIds: ids, includeNotes });
  return { ...observed, fingerprint: fingerprint(observed.records),
    rawClinicalFingerprint: fingerprint(observed.rawClinicalStorage) };
}

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort()
    .map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}

// W3's documented content checksum: sorted JSON, excluding only its own pin and
// content-clock bookkeeping. A new read projection must update this checksum;
// dropping it from the comparison would conceal an unrelated content mutation.
function contentChecksum(payload) {
  const content = structuredClone(payload);
  delete content._pinned; delete content._pinnedState; delete content._contentAtISO;
  const text = canonical(content);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index); hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36) + '.' + text.length.toString(36);
}

function inferredVisit(patientId, date) {
  // Public v1 legacy identity contract: SHA-256 namespace + owner + clinical
  // day, first128 bits with UUIDv8/version and RFC variant. Never use a runtime
  // random UUID or the upgraded API as the expected-value oracle.
  const bytes = createHash('sha256').update('vilda-legacy-visit-v1\0' + patientId + '\0' + date).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 128; bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString('hex');
  return { version: 1,
    visitId: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
    patientId, clinicalDateISO: date, createdAtISO: date + 'T00:00:00.000Z',
    origin: 'legacy-inferred', dateSource: 'measuredAt' };
}

/** One-time, exact old-release → durable-visits projection proof for the dated
 * synthetic patients in these PWA tests. Nothing is stripped from either side.
 * Later assertions continue comparing the complete upgraded public fingerprint,
 * so any subsequent UUID, provenance, pin, clinical, note or timestamp mutation
 * remains a failure.
 */
export function assertLegacyVisitUpgrade(before, after, { clinicalDateISO = '2026-06-17', includeNotes = false } = {}) {
  assert.ok(before.records.length > 0, 'the upgrade proof contains patients');
  assert.ok(before.rawClinicalStorage.stores.patients.length > 0, 'the proof reads native encrypted patients');
  assert.ok(before.rawClinicalStorage.stores.snapshots.length > 0, 'the proof reads native encrypted snapshots');
  const expectedStorage = structuredClone(before.rawClinicalStorage);
  // Existing account migration (observed with pinned old deployments) adds only
  // this boolean to the existing singleton. Its other fields, encrypted trash,
  // clinical shadow rows, all store keys and every cipher byte stay exact.
  const singletonKey = JSON.stringify(['string', 'singleton']);
  const beforeMetaKeys = expectedStorage.keys.meta;
  assert.equal(beforeMetaKeys.filter(key => JSON.stringify(key) === singletonKey).length, 1,
    'the native vault has exactly one existing singleton');
  const singletonIndex = beforeMetaKeys.findIndex(key => JSON.stringify(key) === singletonKey);
  const singleton = expectedStorage.stores.meta[singletonIndex];
  const observedSingleton = after.rawClinicalStorage.stores.meta[singletonIndex];
  assert.equal(singleton[0], 'Object');
  assert.equal(observedSingleton[0], 'Object');
  const marker = 'clinicalScrubDoneV1';
  const beforeMarker = singleton[1].find(([key]) => key === marker);
  const afterMarker = observedSingleton[1].find(([key]) => key === marker);
  if (!beforeMarker && afterMarker) {
    assert.deepStrictEqual(afterMarker, [marker, ['boolean', true]], 'only the known completed schema marker may be added');
    singleton[1].push([marker, ['boolean', true]]);
  }
  assert.deepStrictEqual(after.rawClinicalStorage, expectedStorage,
    'cold upgrade leaves every stored value/key unchanged except the exact known singleton schema marker');
  assert.equal(before.rawClinicalFingerprint, fingerprint(before.rawClinicalStorage));
  assert.equal(after.rawClinicalFingerprint, fingerprint(expectedStorage));
  assert.equal(before.fingerprint, fingerprint(before.records));
  const expected = structuredClone(before.records);
  for (const record of expected) {
    const patient = includeNotes ? record.patient : record;
    assert.ok(patient.snapshots.length > 0, 'each synthetic patient has a stored snapshot');
    for (const snapshot of patient.snapshots) {
      const payload = snapshot.payload;
      assert.equal(Object.hasOwn(payload, 'visit'), false, 'the pinned old release has no durable visit metadata');
      assert.equal(payload.user.measuredAtISO, clinicalDateISO, 'the fixture provides an exact clinical date');
      const hasChecksum = typeof payload._pinnedState?.h === 'string';
      if (hasChecksum) assert.equal(payload._pinnedState.h, contentChecksum(payload), 'the old W3 checksum is intact');
      payload.visit = inferredVisit(patient.patientId, clinicalDateISO);
      if (hasChecksum) payload._pinnedState.h = contentChecksum(payload);
    }
  }
  assert.deepStrictEqual(after.records, expected, 'only the exact inferred visit and its W3 checksum extend the public projection');
  assert.equal(after.fingerprint, fingerprint(expected), 'the upgraded fingerprint includes all metadata and clinical content');
}
