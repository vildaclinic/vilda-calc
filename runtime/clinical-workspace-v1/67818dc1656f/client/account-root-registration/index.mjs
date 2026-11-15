// Unloaded registration ceremony. Import/factory creation performs no I/O.
// Only native requests to a pre-retained service origin can supply a receipt.
import { createJournal } from '../account-root/journal.mjs';
import { inspectRecord, recordImage } from '../account-root/codec.mjs';
import { createRegistrationJournal } from './journal.mjs';
import {
  inspectOrigin, inspectArgs, inspectRegistrationRecord, registrationImage,
  registrationError
} from './format.mjs';
import {
  ownerImageDigest, generateRegistrationRecord, verifyRegistrationRecord,
  requestChallenge, signGenesis, submitGenesis, resumeGenesis, sealReceipt,
  assertFresh
} from './protocol.mjs';

const CODES = new Set(['INVALID', 'UNSUPPORTED', 'STORAGE', 'BLOCKED', 'CLOSED',
  'CORRUPT', 'CONFLICT', 'FROZEN', 'MISSING', 'NOT_READY', 'EXPIRED', 'NETWORK',
  'SERVICE_REJECTED', 'UNCONFIRMED', 'LIMIT']);
function fail(code) { throw registrationError('ROOT_REG_' + code); }
function codeOf(error) {
  let code;
  try { code = error?.code; } catch { return 'ROOT_REG_STORAGE'; }
  if (typeof code !== 'string') return 'ROOT_REG_STORAGE';
  for (const prefix of ['ROOT_REG_', 'ROOT_LOCAL_']) {
    if (code.startsWith(prefix) && CODES.has(code.slice(prefix.length)))
      return 'ROOT_REG_' + code.slice(prefix.length);
  }
  return 'ROOT_REG_STORAGE';
}
function noArgs(args) { if (args.length) fail('INVALID'); }
function status(checked) {
  const row = checked.record, retained = checked.receipt !== null;
  return Object.freeze({
    namespace: 'vilda-account-root-registration-status', protocol: 1,
    operationId: row.operationId, accountRootId: row.intent.accountRootId,
    intentDigest: row.intentDigest, serviceOrigin: row.serviceOrigin,
    revision: row.revision, localRecoveryVerified: true,
    requestRetained: row.attempts.length > 0, receiptRetained: retained,
    rootRegistered: retained, rootUsable: false, recoveryProvisioned: false,
    ownerAuthorized: false, recoveryVerified: false, enrollmentAuthorized: false,
    historicalIdentityVerified: false, readAvailable: false, writeAvailable: false,
    clinicalReady: false
  });
}

/** serviceOrigin is independent trusted configuration, retained before any
 * request. HTTPS does not attest which implementation the service runs.
 * This factory never creates an owner or exposes its signing/resume material. */
export function createAccountRootRegistrationClient(...options) {
  if (options.length !== 1) fail('INVALID');
  if (globalThis.isSecureContext !== true || !globalThis.indexedDB
    || typeof globalThis.indexedDB.open !== 'function' || !globalThis.crypto?.subtle
    || typeof globalThis.crypto.getRandomValues !== 'function'
    || typeof globalThis.fetch !== 'function' || typeof globalThis.AbortController !== 'function')
    fail('UNSUPPORTED');
  const serviceOrigin = inspectOrigin(inspectArgs(options[0], ['serviceOrigin']).serviceOrigin);
  const owners = createJournal(), journal = createRegistrationJournal();
  const controllers = new Set();
  const capture = () => {
    const generation = { owner: owners.generation, registration: journal.generation };
    fence(generation);
    return generation;
  };
  function fence(generation) {
    owners.assertGeneration(generation.owner);
    journal.assertGeneration(generation.registration);
  }
  async function perform(action) {
    let generation;
    try {
      generation = capture();
      const value = await action(generation);
      fence(generation);
      return value;
    } catch (error) {
      if (generation !== undefined) {
        try { fence(generation); } catch { fail('CLOSED'); }
      }
      throw registrationError(codeOf(error));
    }
  }
  async function request(generation, action) {
    const controller = new AbortController();
    controllers.add(controller);
    try {
      fence(generation);
      const result = await action(controller.signal);
      fence(generation);
      return result;
    } catch (error) {
      fence(generation);
      throw error;
    } finally { controllers.delete(controller); }
  }
  async function compareOwner(owner, generation) {
    const same = await owners.compare(owner.record.operationId, owner.record.revision, owner.image);
    fence(generation);
    if (!same) fail('CONFLICT');
  }
  async function readOwner(operationId, generation) {
    const raw = await owners.read(operationId); fence(generation);
    if (raw === null) fail('MISSING');
    const record = inspectRecord(raw), image = recordImage(record);
    const digest = await ownerImageDigest(record); fence(generation);
    const owner = { record, image, digest };
    await compareOwner(owner, generation); fence(generation);
    return owner;
  }
  async function readChecked(operationId, generation, missingAllowed = false) {
    const raw = await journal.read(operationId); fence(generation);
    if (raw === null) {
      if (missingAllowed) return null;
      fail('MISSING');
    }
    const record = inspectRegistrationRecord(raw);
    if (record.serviceOrigin !== serviceOrigin) fail('CONFLICT');
    const owner = await readOwner(operationId, generation); fence(generation);
    if (record.ownerImageDigest !== owner.digest) fail('CONFLICT');
    const verified = await verifyRegistrationRecord(owner.record, record); fence(generation);
    // Separate DBs have no shared transaction. The verified owner is immutable
    // under normal writers; the final comparison is of the mutable ledger.
    await compareOwner(owner, generation); fence(generation);
    const same = await journal.compare(operationId, record.revision, registrationImage(record)); fence(generation);
    if (!same) fail('CONFLICT');
    return { record, owner, receipt: verified.receipt, receiptText: verified.receiptText };
  }
  async function readExpected(expected, generation) {
    const checked = await readChecked(expected.operationId, generation); fence(generation);
    if (checked.record.revision !== expected.revision
      || registrationImage(checked.record) !== registrationImage(expected)) fail('CONFLICT');
    return checked;
  }
  function expectedRevision(checked, revision) {
    if (checked.record.revision !== revision) fail('CONFLICT');
  }
  async function retainReceipt(checked, result, generation) {
    if (checked.receipt !== null) {
      if (checked.receiptText !== result.text) fail('CONFLICT');
      return status(await readExpected(checked.record, generation));
    }
    const receipt = await sealReceipt(checked.owner.record, checked.record, result.text); fence(generation);
    const next = inspectRegistrationRecord({ ...checked.record,
      revision: checked.record.revision + 1, receipt });
    await compareOwner(checked.owner, generation); fence(generation);
    try {
      await journal.cas(next.operationId, checked.record.revision,
        registrationImage(checked.record), next); fence(generation);
    } catch (error) {
      fence(generation);
      if (!['ROOT_REG_CONFLICT', 'ROOT_REG_FROZEN'].includes(codeOf(error))) throw error;
      // Two authenticated responses for the same decision can converge on an
      // already-retained identical receipt; no old row is overwritten.
      const latest = await readChecked(next.operationId, generation); fence(generation);
      if (latest.receipt !== null && latest.receiptText === result.text) return status(latest);
      throw error;
    }
    const retained = await readExpected(next, generation); fence(generation);
    if (retained.receipt === null || retained.receiptText !== result.text) fail('CORRUPT');
    return status(retained);
  }
  return Object.freeze({
    prepareRegistration(input) {
      return perform(async generation => {
        const args = inspectArgs(input, ['operationId']);
        const existing = await readChecked(args.operationId, generation, true); fence(generation);
        if (existing !== null) return status(existing);
        const owner = await readOwner(args.operationId, generation); fence(generation);
        const next = inspectRegistrationRecord(await generateRegistrationRecord(owner.record, serviceOrigin)); fence(generation);
        await compareOwner(owner, generation); fence(generation);
        const added = await journal.add(next); fence(generation);
        if (added) return status(await readExpected(next, generation));
        const latest = await readChecked(args.operationId, generation); fence(generation);
        if (latest.record.ownerImageDigest !== next.ownerImageDigest
          || latest.record.intentDigest !== next.intentDigest) fail('CONFLICT');
        return status(latest);
      });
    },
    readStatus(input) {
      return perform(async generation => {
        const args = inspectArgs(input, ['operationId']);
        const checked = await readChecked(args.operationId, generation, true); fence(generation);
        return checked === null ? null : status(checked);
      });
    },
    register(input) {
      return perform(async generation => {
        const args = inspectArgs(input, ['operationId', 'expectedRevision']);
        let checked = await readChecked(args.operationId, generation); fence(generation);
        expectedRevision(checked, args.expectedRevision);
        if (checked.receipt !== null) fail('FROZEN');
        let resumed;
        try {
          resumed = await request(generation, signal => resumeGenesis(checked.owner.record, serviceOrigin, signal, () => fence(generation)));
          fence(generation);
        } catch (error) {
          fence(generation);
          if (codeOf(error) !== 'ROOT_REG_UNCONFIRMED') throw error;
        }
        if (resumed) return retainReceipt(checked, resumed, generation);
        // A typed resume denial is not proof of absence. Reconciliation never
        // changes the root/intent/resume credential, even after an old timeout.
        checked = await readExpected(checked.record, generation); fence(generation);
        let proof = checked.record.attempts.at(-1)?.proof;
        if (proof) {
          try { assertFresh(proof.statement); }
          catch (error) {
            if (codeOf(error) !== 'ROOT_REG_EXPIRED') throw error;
            proof = null;
          }
        }
        if (!proof) {
          // Resume must run even at the limit, so a prior committed attempt can
          // still be recovered. Limits never erase retained command history.
          if (checked.record.attempts.length >= 16) fail('LIMIT');
          const statement = await request(generation,
            signal => requestChallenge(checked.owner.record, serviceOrigin, signal, () => fence(generation))); fence(generation);
          const signed = await signGenesis(checked.owner.record, statement); fence(generation);
          const next = inspectRegistrationRecord({ ...checked.record,
            revision: checked.record.revision + 1,
            attempts: [...checked.record.attempts, { revision: checked.record.revision + 1, proof: signed }] });
          await compareOwner(checked.owner, generation); fence(generation);
          await journal.cas(args.operationId, checked.record.revision,
            registrationImage(checked.record), next); fence(generation);
          checked = await readExpected(next, generation); fence(generation);
          // Dispatch ONLY the actual transaction-completed, reread proof.
          proof = checked.record.attempts.at(-1).proof;
        }
        const result = await request(generation,
          signal => submitGenesis(checked.owner.record, serviceOrigin, proof, signal, () => fence(generation))); fence(generation);
        return retainReceipt(checked, result, generation);
      });
    },
    resumeRegistration(input) {
      return perform(async generation => {
        const args = inspectArgs(input, ['operationId', 'expectedRevision']);
        const checked = await readChecked(args.operationId, generation); fence(generation);
        expectedRevision(checked, args.expectedRevision);
        const result = await request(generation,
          signal => resumeGenesis(checked.owner.record, serviceOrigin, signal, () => fence(generation))); fence(generation);
        return retainReceipt(checked, result, generation);
      });
    },
    getReceipt(input) {
      return perform(async generation => {
        const args = inspectArgs(input, ['operationId']);
        const checked = await readChecked(args.operationId, generation); fence(generation);
        if (checked.receipt === null) fail('NOT_READY');
        return Object.freeze({ status: status(checked), receipt: checked.receipt });
      });
    },
    close(...args) {
      noArgs(args);
      owners.close(); journal.close();
      for (const controller of controllers) controller.abort();
      controllers.clear();
    }
  });
}
