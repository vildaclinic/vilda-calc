// Standalone local preparation only. Importing this module opens no database,
// signs no server request and performs no network or existing-vault operation.
import { inspectRecord, recordImage, inspectIntent, canonicalIntentText } from './codec.mjs';
import {
  generateDraftRecord, verifyDraftRecord, makeRecoveryPackage,
  makeVerificationSeal, restoreDraftRecord
} from './crypto.mjs';
import { createJournal } from './journal.mjs';

function fail(code) {
  const error = new Error('The local account-root operation could not be completed.');
  error.code = code;
  throw error;
}
const invalid = () => fail('ROOT_LOCAL_INVALID');
const token = value => typeof value === 'string' && value.length >= 1 && value.length <= 128
  && /^[A-Za-z0-9]/.test(value) && !/[^A-Za-z0-9._-]/.test(value);
const positive = value => Number.isSafeInteger(value) && value > 0;
const ERROR_CODES = new Set([
  'ROOT_LOCAL_INVALID', 'ROOT_LOCAL_UNSUPPORTED', 'ROOT_LOCAL_STORAGE',
  'ROOT_LOCAL_BLOCKED', 'ROOT_LOCAL_CLOSED', 'ROOT_LOCAL_CORRUPT',
  'ROOT_LOCAL_CONFLICT', 'ROOT_LOCAL_FROZEN', 'ROOT_LOCAL_MISSING',
  'ROOT_LOCAL_NOT_READY'
]);
function argsRecord(input, fields) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid();
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== null && prototype !== Object.prototype) invalid();
  const keys = Reflect.ownKeys(input);
  if (keys.length !== fields.length || keys.some(key => typeof key !== 'string' || !fields.includes(key))) invalid();
  const result = Object.create(null);
  for (const key of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) invalid();
    result[key] = descriptor.value;
  }
  if (!token(result.operationId) && fields.includes('operationId')) invalid();
  if (!positive(result.expectedRevision) && fields.includes('expectedRevision')) invalid();
  for (const key of ['packetText', 'recoveryCode']) {
    if (fields.includes(key) && typeof result[key] !== 'string') invalid();
  }
  return result;
}
function status(record, verified) {
  return Object.freeze({
    namespace: 'vilda-account-root-local-status', protocol: 1,
    operationId: record.operationId, accountRootId: record.intent.accountRootId,
    intentDigest: record.intentDigest, revision: record.revision,
    packetRevision: record.artifact ? record.artifact.revision : null,
    packetDigest: record.artifact ? record.artifact.packetDigest : null,
    localRecoveryVerified: verified, localIntentReady: verified,
    rootRegistered: false, rootUsable: false, recoveryProvisioned: false,
    ownerAuthorized: false, recoveryVerified: false, enrollmentAuthorized: false,
    historicalIdentityVerified: false, readAvailable: false, writeAvailable: false,
    clinicalReady: false
  });
}
function nextRevision(record) {
  if (!positive(record.revision + 1)) fail('ROOT_LOCAL_CORRUPT');
  return record.revision + 1;
}

/** A fresh createDraft call means a NEW prospective namespace. Use list/read
 * to resume an existing operation, never creation as a recovery fallback. */
export function createAccountRootClient(...options) {
  if (options.length) invalid();
  if (globalThis.isSecureContext !== true || !globalThis.indexedDB
    || typeof globalThis.indexedDB.open !== 'function' || !globalThis.crypto?.subtle
    || typeof globalThis.crypto.getRandomValues !== 'function') fail('ROOT_LOCAL_UNSUPPORTED');
  const journal = createJournal();
  const capture = () => {
    const generation = journal.generation;
    journal.assertGeneration(generation);
    return generation;
  };
  const fence = generation => journal.assertGeneration(generation);
  async function perform(action) {
    let generation;
    try {
      generation = capture();
      const result = await action(generation);
      // Check again at the public promise's completion, after nested helpers.
      fence(generation);
      return result;
    } catch (error) {
      // Closure wins over failures from work that was still pending at close.
      // Only our fixed codes escape; never forward caller-provided exceptions.
      if (generation !== undefined) fence(generation);
      let code;
      try { code = error?.code; } catch { /* Untrusted exceptions may have getters. */ }
      if (ERROR_CODES.has(code)) fail(code);
      fail('ROOT_LOCAL_STORAGE');
    }
  }

  async function readChecked(operationId, generation, missingAllowed = false) {
    const raw = await journal.read(operationId); fence(generation);
    if (raw === null) {
      if (missingAllowed) return null;
      fail('ROOT_LOCAL_MISSING');
    }
    const record = inspectRecord(raw);
    const verified = await verifyDraftRecord(record); fence(generation);
    if (typeof verified !== 'boolean') fail('ROOT_LOCAL_CORRUPT');
    // This is the last asynchronous operation before publishing the snapshot.
    // It is a point-in-time comparison, not a promise against later DB changes.
    const matches = await journal.compare(operationId, record.revision, recordImage(record)); fence(generation);
    if (!matches) fail('ROOT_LOCAL_CONFLICT');
    return { record, verified };
  }
  async function readExpected(expected, generation) {
    const checked = await readChecked(expected.operationId, generation); fence(generation);
    if (checked.record.revision !== expected.revision
      || recordImage(checked.record) !== recordImage(expected)) fail('ROOT_LOCAL_CONFLICT');
    return checked;
  }
  const noArgs = values => { if (values.length) invalid(); };
  return Object.freeze({
    createDraft(...args) {
      return perform(async generation => {
        noArgs(args);
        const record = inspectRecord(await generateDraftRecord()); fence(generation);
        if (record.revision !== 1 || record.artifact !== null || record.verification !== null)
          fail('ROOT_LOCAL_CORRUPT');
        const verified = await verifyDraftRecord(record); fence(generation);
        if (verified !== false) fail('ROOT_LOCAL_CORRUPT');
        const added = await journal.add(record); fence(generation);
        if (!added) fail('ROOT_LOCAL_CONFLICT');
        const checked = await readExpected(record, generation); fence(generation);
        return status(checked.record, checked.verified);
      });
    },
    listDrafts(...args) {
      return perform(async generation => {
        noArgs(args);
        const records = await journal.list(); fence(generation);
        const checked = [];
        for (const raw of records) {
          const record = inspectRecord(raw);
          const verified = await verifyDraftRecord(record); fence(generation);
          if (typeof verified !== 'boolean') fail('ROOT_LOCAL_CORRUPT');
          checked.push({ record, verified });
        }
        const before = new Map(checked.map(value => [value.record.operationId, recordImage(value.record)]));
        const latest = await journal.list(); fence(generation);
        if (latest.length !== before.size || latest.some(record => before.get(record.operationId) !== recordImage(record)))
          fail('ROOT_LOCAL_CONFLICT');
        return Object.freeze(checked.map(value => status(value.record, value.verified)));
      });
    },
    readStatus(input) {
      return perform(async generation => {
        const args = argsRecord(input, ['operationId']);
        const checked = await readChecked(args.operationId, generation, true); fence(generation);
        return checked === null ? null : status(checked.record, checked.verified);
      });
    },
    createRecoveryPackage(input) {
      return perform(async generation => {
        const args = argsRecord(input, ['operationId', 'expectedRevision']);
        const { record } = await readChecked(args.operationId, generation); fence(generation);
        if (record.revision !== args.expectedRevision) fail('ROOT_LOCAL_CONFLICT');
        if (record.verification !== null) fail('ROOT_LOCAL_FROZEN');
        const output = await makeRecoveryPackage(record); fence(generation);
        const revision = nextRevision(record);
        const next = inspectRecord({ ...record, revision, artifact: {
          revision, packetText: output.packetText, packetDigest: output.packetDigest
        } });
        await journal.cas(args.operationId, record.revision, recordImage(record), next); fence(generation);
        const checked = await readExpected(next, generation); fence(generation);
        return Object.freeze({ status: status(checked.record, checked.verified),
          packetText: output.packetText, recoveryCode: output.recoveryCode });
      });
    },
    verifyRecoveryPackage(input) {
      return perform(async generation => {
        const args = argsRecord(input, ['operationId', 'expectedRevision', 'packetText', 'recoveryCode']);
        const { record } = await readChecked(args.operationId, generation); fence(generation);
        if (record.revision !== args.expectedRevision) fail('ROOT_LOCAL_CONFLICT');
        if (record.verification !== null) fail('ROOT_LOCAL_FROZEN');
        if (record.artifact === null) fail('ROOT_LOCAL_NOT_READY');
        const verification = await makeVerificationSeal(record, args.packetText, args.recoveryCode); fence(generation);
        const next = inspectRecord({ ...record, revision: nextRevision(record), verification });
        await journal.cas(args.operationId, record.revision, recordImage(record), next); fence(generation);
        const checked = await readExpected(next, generation); fence(generation);
        if (checked.verified !== true) fail('ROOT_LOCAL_CORRUPT');
        return status(checked.record, true);
      });
    },
    restoreDraft(input) {
      return perform(async generation => {
        const args = argsRecord(input, ['packetText', 'recoveryCode']);
        const record = inspectRecord(await restoreDraftRecord(args.packetText, args.recoveryCode)); fence(generation);
        const verified = await verifyDraftRecord(record); fence(generation);
        if (verified !== true || record.revision !== 1 || record.artifact?.revision !== 1)
          fail('ROOT_LOCAL_CORRUPT');
        const added = await journal.add(record); fence(generation);
        if (added) {
          const checked = await readExpected(record, generation); fence(generation);
          return status(checked.record, checked.verified);
        }
        const existing = await readChecked(record.operationId, generation); fence(generation);
        if (existing.record.intentDigest !== record.intentDigest
          || canonicalIntentText(existing.record.intent) !== canonicalIntentText(record.intent)
          || existing.record.artifact?.packetDigest !== record.artifact.packetDigest
          || existing.record.artifact?.packetText !== record.artifact.packetText) fail('ROOT_LOCAL_CONFLICT');
        // Matching existing rows are read, never replaced or upgraded to ready.
        return status(existing.record, existing.verified);
      });
    },
    getPreparedIntent(input) {
      return perform(async generation => {
        const args = argsRecord(input, ['operationId']);
        const checked = await readChecked(args.operationId, generation); fence(generation);
        if (checked.verified !== true) fail('ROOT_LOCAL_NOT_READY');
        return Object.freeze({ status: status(checked.record, true), intent: inspectIntent(checked.record.intent) });
      });
    },
    close(...args) { noArgs(args); journal.close(); }
  });
}
