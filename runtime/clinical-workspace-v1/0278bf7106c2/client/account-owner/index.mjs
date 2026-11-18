// Unloaded owner-role ceremony. Factory/import perform no I/O. Historical
// receipts remain distinct from a fresh, purpose-scoped current-role read.
import { createJournal } from '../account-root/journal.mjs';
import { inspectRecord, recordImage } from '../account-root/codec.mjs';
import { createRegistrationJournal } from '../account-root-registration/journal.mjs';
import { inspectOrigin, inspectRegistrationRecord, registrationImage } from '../account-root-registration/format.mjs';
import { createOwnerJournal } from './journal.mjs';
import { ownerClientError, inspectArgs, inspectOwnerRecord, ownerRecordImage } from './format.mjs';
import {
  verifyOwnerContext, generateOwnerRecord, verifyOwnerRecord, requestOwnerChallenge,
  signOwnerProof, submitOwnerEstablishment, resumeOwnerEstablishment, sealOwnerReceipt,
  generateReadIntent, submitOwnerRead, assertOwnerFresh
} from './protocol.mjs';

const SUFFIXES = new Set(['INVALID', 'UNSUPPORTED', 'STORAGE', 'BLOCKED', 'CLOSED',
  'CORRUPT', 'CONFLICT', 'FROZEN', 'MISSING', 'NOT_READY', 'EXPIRED', 'NETWORK',
  'SERVICE_REJECTED', 'UNCONFIRMED', 'LIMIT']);
function fail(suffix) { throw ownerClientError('ROOT_OWNER_CLIENT_' + suffix); }
function codeOf(error) {
  let code;
  try { code = error?.code; } catch { return 'ROOT_OWNER_CLIENT_STORAGE'; }
  if (typeof code === 'string') {
    for (const prefix of ['ROOT_OWNER_CLIENT_', 'ROOT_LOCAL_', 'ROOT_REG_']) {
      if (code.startsWith(prefix) && SUFFIXES.has(code.slice(prefix.length)))
        return 'ROOT_OWNER_CLIENT_' + code.slice(prefix.length);
    }
  }
  return 'ROOT_OWNER_CLIENT_STORAGE';
}
function status(checked) {
  const row = checked.record, retained = checked.receipt !== null;
  return Object.freeze({
    namespace: 'vilda-account-owner-client-status', protocol: 1,
    rootOperationId: row.rootOperationId, ownerOperationId: row.intent.operationId,
    accountRootId: row.intent.accountRootId, genesisIntentDigest: row.intent.genesisIntentDigest,
    intentDigest: row.intentDigest, serviceOrigin: row.serviceOrigin, revision: row.revision,
    localRecoveryVerified: true, rootRegistered: true,
    requestRetained: row.attempts.length > 0, receiptRetained: retained,
    roleEstablished: retained, establishedRevision: retained ? 1 : null,
    ownerAuthorized: false, rootUsable: false, recoveryProvisioned: false,
    recoveryVerified: false, enrollmentAuthorized: false, historicalIdentityVerified: false,
    readAvailable: false, writeAvailable: false, clinicalReady: false, delegationAvailable: false
  });
}

/** A separate establishment journal never becomes a cache of current authority.
 * serviceOrigin is independent trusted configuration, not a request argument. */
export function createAccountOwnerClient(...options) {
  if (options.length !== 1) fail('INVALID');
  if (globalThis.isSecureContext !== true || typeof globalThis.indexedDB?.open !== 'function'
    || !globalThis.crypto?.subtle || typeof globalThis.crypto.getRandomValues !== 'function'
    || typeof globalThis.fetch !== 'function' || typeof globalThis.AbortController !== 'function')
    fail('UNSUPPORTED');
  let serviceOrigin;
  try { serviceOrigin = inspectOrigin(inspectArgs(options[0], ['serviceOrigin']).serviceOrigin); }
  catch (error) { throw ownerClientError(codeOf(error)); }
  const owners = createJournal(), registrations = createRegistrationJournal(), journal = createOwnerJournal();
  const controllers = new Set();
  function fence(generation) {
    owners.assertGeneration(generation.owner);
    registrations.assertGeneration(generation.registration);
    journal.assertGeneration(generation.role);
  }
  function capture() {
    const generation = { owner: owners.generation, registration: registrations.generation, role: journal.generation };
    fence(generation); return generation;
  }
  async function perform(action) {
    let generation;
    try {
      generation = capture();
      const result = await action(generation); fence(generation);
      return result;
    } catch (error) {
      if (generation !== undefined) {
        try { fence(generation); } catch { fail('CLOSED'); }
      }
      throw ownerClientError(codeOf(error));
    }
  }
  async function request(generation, action) {
    const controller = new AbortController(); controllers.add(controller);
    try {
      fence(generation);
      const result = await action(controller.signal); fence(generation);
      return result;
    } catch (error) { fence(generation); throw error; }
    finally { controllers.delete(controller); }
  }
  async function compareContext(context, generation) {
    const { owner, registration } = context;
    const sameOwner = await owners.compare(owner.operationId, owner.revision, context.ownerImage); fence(generation);
    if (!sameOwner) fail('CONFLICT');
    const sameRegistration = await registrations.compare(registration.operationId,
      registration.revision, context.registrationImage); fence(generation);
    if (!sameRegistration) fail('CONFLICT');
  }
  async function readContext(rootOperationId, generation) {
    const ownerRaw = await owners.read(rootOperationId); fence(generation);
    if (ownerRaw === null) fail('MISSING');
    const owner = inspectRecord(ownerRaw), ownerImage = recordImage(owner);
    const registrationRaw = await registrations.read(rootOperationId); fence(generation);
    if (registrationRaw === null) fail('NOT_READY');
    const registration = inspectRegistrationRecord(registrationRaw), regImage = registrationImage(registration);
    if (registration.serviceOrigin !== serviceOrigin) fail('CONFLICT');
    const pins = await verifyOwnerContext(owner, registration, serviceOrigin); fence(generation);
    const context = { owner, registration, ownerImage, registrationImage: regImage, pins };
    await compareContext(context, generation); fence(generation);
    return context;
  }
  async function readChecked(rootOperationId, generation, missingAllowed = false) {
    const raw = await journal.read(rootOperationId); fence(generation);
    if (raw === null) {
      if (missingAllowed) return null;
      fail('MISSING');
    }
    const record = inspectOwnerRecord(raw);
    if (record.serviceOrigin !== serviceOrigin) fail('CONFLICT');
    const context = await readContext(rootOperationId, generation); fence(generation);
    const verified = await verifyOwnerRecord(context.owner, context.registration, record); fence(generation);
    await compareContext(context, generation); fence(generation);
    const same = await journal.compare(rootOperationId, record.revision, ownerRecordImage(record)); fence(generation);
    if (!same) fail('CONFLICT');
    return { record, context, receipt: verified.receipt, receiptText: verified.receiptText };
  }
  async function readExpected(record, generation) {
    const checked = await readChecked(record.rootOperationId, generation); fence(generation);
    if (checked.record.revision !== record.revision
      || ownerRecordImage(checked.record) !== ownerRecordImage(record)) fail('CONFLICT');
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
    const { owner, registration } = checked.context;
    const receipt = await sealOwnerReceipt(owner, registration, checked.record, result.text); fence(generation);
    const next = inspectOwnerRecord({ ...checked.record, revision: checked.record.revision + 1, receipt });
    await compareContext(checked.context, generation); fence(generation);
    try {
      await journal.cas(next.rootOperationId, checked.record.revision, ownerRecordImage(checked.record), next); fence(generation);
    } catch (error) {
      fence(generation);
      if (!['ROOT_OWNER_CLIENT_CONFLICT', 'ROOT_OWNER_CLIENT_FROZEN'].includes(codeOf(error))) throw error;
      const latest = await readChecked(next.rootOperationId, generation); fence(generation);
      if (latest.receipt !== null && latest.receiptText === result.text) return status(latest);
      throw error;
    }
    const retained = await readExpected(next, generation); fence(generation);
    if (retained.receipt === null || retained.receiptText !== result.text) fail('CORRUPT');
    return status(retained);
  }
  return Object.freeze({
    prepareEstablishment(input) {
      return perform(async generation => {
        const args = inspectArgs(input, ['rootOperationId']);
        const existing = await readChecked(args.rootOperationId, generation, true); fence(generation);
        if (existing !== null) return status(existing);
        const context = await readContext(args.rootOperationId, generation); fence(generation);
        const next = inspectOwnerRecord(await generateOwnerRecord(context.owner, context.registration, serviceOrigin)); fence(generation);
        await compareContext(context, generation); fence(generation);
        const added = await journal.add(next); fence(generation);
        if (added) return status(await readExpected(next, generation));
        // Native add chooses one operation/secret. A losing prepare adopts the
        // verified winner for this root; its new random candidate is discarded.
        const latest = await readChecked(args.rootOperationId, generation); fence(generation);
        if (latest.record.ownerImageDigest !== next.ownerImageDigest
          || latest.record.genesisReceiptDigest !== next.genesisReceiptDigest) fail('CONFLICT');
        return status(latest);
      });
    },
    readStatus(input) {
      return perform(async generation => {
        const args = inspectArgs(input, ['rootOperationId']);
        const checked = await readChecked(args.rootOperationId, generation, true); fence(generation);
        return checked === null ? null : status(checked);
      });
    },
    establish(input) {
      return perform(async generation => {
        const args = inspectArgs(input, ['rootOperationId', 'expectedRevision']);
        let checked = await readChecked(args.rootOperationId, generation); fence(generation);
        expectedRevision(checked, args.expectedRevision);
        if (checked.receipt !== null) fail('FROZEN');
        let resumed;
        try {
          resumed = await request(generation, signal => resumeOwnerEstablishment(checked.context.owner,
            checked.context.registration, checked.record, signal, () => fence(generation))); fence(generation);
        } catch (error) {
          fence(generation);
          if (codeOf(error) !== 'ROOT_OWNER_CLIENT_UNCONFIRMED') throw error;
        }
        if (resumed) return retainReceipt(checked, resumed, generation);
        checked = await readExpected(checked.record, generation); fence(generation);
        let proof = checked.record.attempts.at(-1)?.proof;
        if (proof) {
          try { assertOwnerFresh(proof.statement); }
          catch (error) {
            if (codeOf(error) !== 'ROOT_OWNER_CLIENT_EXPIRED') throw error;
            proof = null;
          }
        }
        if (!proof) {
          if (checked.record.attempts.length >= 16) fail('LIMIT');
          const { owner, registration } = checked.context;
          const statement = await request(generation, signal => requestOwnerChallenge(owner, registration,
            checked.record.intent, serviceOrigin, signal, () => fence(generation))); fence(generation);
          const signed = await signOwnerProof(owner, registration, checked.record.intent, statement, serviceOrigin); fence(generation);
          const next = inspectOwnerRecord({ ...checked.record, revision: checked.record.revision + 1,
            attempts: [...checked.record.attempts, { revision: checked.record.revision + 1, proof: signed }] });
          await compareContext(checked.context, generation); fence(generation);
          // A losing CAS must never dispatch its independently produced signature.
          await journal.cas(args.rootOperationId, checked.record.revision, ownerRecordImage(checked.record), next); fence(generation);
          checked = await readExpected(next, generation); fence(generation);
          proof = checked.record.attempts.at(-1).proof;
        }
        const result = await request(generation, signal => submitOwnerEstablishment(checked.context.owner,
          checked.context.registration, checked.record, proof, signal, () => fence(generation))); fence(generation);
        return retainReceipt(checked, result, generation);
      });
    },
    resumeEstablishment(input) {
      return perform(async generation => {
        const args = inspectArgs(input, ['rootOperationId', 'expectedRevision']);
        const checked = await readChecked(args.rootOperationId, generation); fence(generation);
        expectedRevision(checked, args.expectedRevision);
        const result = await request(generation, signal => resumeOwnerEstablishment(checked.context.owner,
          checked.context.registration, checked.record, signal, () => fence(generation))); fence(generation);
        return retainReceipt(checked, result, generation);
      });
    },
    readCurrentOwner(input) {
      return perform(async generation => {
        const args = inspectArgs(input, ['rootOperationId', 'expectedRoleRevision']);
        // No role journal open/read/write here. A recovered genesis owner can
        // request this fresh observation without a historical establishment token.
        const context = await readContext(args.rootOperationId, generation); fence(generation);
        const { owner, registration } = context;
        const intent = await generateReadIntent(owner, registration, serviceOrigin, args.expectedRoleRevision); fence(generation);
        await compareContext(context, generation); fence(generation);
        const statement = await request(generation, signal => requestOwnerChallenge(owner, registration,
          intent, serviceOrigin, signal, () => fence(generation))); fence(generation);
        const proof = await signOwnerProof(owner, registration, intent, statement, serviceOrigin); fence(generation);
        await compareContext(context, generation); fence(generation);
        const result = await request(generation, signal => submitOwnerRead(owner, registration,
          serviceOrigin, intent, proof, signal, () => fence(generation))); fence(generation);
        await compareContext(context, generation); fence(generation);
        assertOwnerFresh(statement);
        return result.observation;
      });
    },
    close(...args) {
      if (args.length) fail('INVALID');
      owners.close(); registrations.close(); journal.close();
      for (const controller of controllers) controller.abort();
      controllers.clear();
    }
  });
}
