// Unloaded enrollment ceremony. Import/factory perform no I/O. Retained
// metadata never becomes authorization or a claim of clinical readiness.
import { createJournal } from '../account-root/journal.mjs';
import { inspectRecord, recordImage } from '../account-root/codec.mjs';
import { createRegistrationJournal } from '../account-root-registration/journal.mjs';
import { inspectOrigin, inspectRegistrationRecord, registrationImage } from '../account-root-registration/format.mjs';
import { verifyOwnerContext } from '../account-owner/protocol.mjs';
import { createEnrollmentJournal, MAX_ENROLLMENT_ATTEMPTS } from './journal.mjs';
import {
  enrollmentClientError, inspectArgs, inspectSource, inspectConsent,
  inspectEnrollmentRecord, enrollmentRecordImage, enrollmentStatus
} from './format.mjs';
import { sourceCheckpointDigest } from './crypto.mjs';
import {
  generateEnrollmentRecord, verifyEnrollmentRecord, requestEnrollmentChallenge,
  signEnrollmentProof, submitEnrollmentAdoption, resumeEnrollmentOperation,
  sealEnrollmentReceipt, assertEnrollmentFresh
} from './protocol.mjs';

const SUFFIXES = new Set(['INVALID', 'UNSUPPORTED', 'STORAGE', 'BLOCKED', 'CLOSED',
  'CORRUPT', 'CONFLICT', 'FROZEN', 'MISSING', 'NOT_READY', 'EXPIRED', 'NETWORK',
  'SERVICE_REJECTED', 'UNCONFIRMED', 'LIMIT']);
function fail(suffix) { throw enrollmentClientError('ENROLLMENT_CLIENT_' + suffix); }
function codeOf(error) {
  let code;
  try { code = error?.code; } catch { return 'ENROLLMENT_CLIENT_STORAGE'; }
  if (typeof code === 'string') {
    for (const prefix of ['ENROLLMENT_CLIENT_', 'ROOT_OWNER_CLIENT_', 'ROOT_LOCAL_', 'ROOT_REG_']) {
      if (code.startsWith(prefix) && SUFFIXES.has(code.slice(prefix.length)))
        return 'ENROLLMENT_CLIENT_' + code.slice(prefix.length);
    }
  }
  return 'ENROLLMENT_CLIENT_STORAGE';
}
function status(checked) {
  return enrollmentStatus(checked.record, { receipt: checked.receipt, receiptText: checked.receiptText });
}
function matchesSource(record, source, consent, digest) {
  // Generated operation/checkpoint identifiers deliberately do not participate
  // in equivalence: identical concurrent preparations may adopt one winner.
  if (record.intent.source.sourceId !== source.sourceId
    || record.intent.source.checkpointDigest !== digest
    || JSON.stringify(record.intent.source.offlineFrontier) !== JSON.stringify(source.offlineFrontier)
    || JSON.stringify(record.intent.consent) !== JSON.stringify(consent)
    || record.intent.expectedRoleRevision !== 1) fail('CONFLICT');
}

/** serviceOrigin is independent trusted configuration. Source bytes are an
 * opaque, bounded checkpoint supplied by the caller, never a legacy-store edit. */
export function createPatientIdentityEnrollmentClient(...options) {
  if (options.length !== 1) fail('INVALID');
  if (globalThis.isSecureContext !== true || typeof globalThis.indexedDB?.open !== 'function'
    || !globalThis.crypto?.subtle || typeof globalThis.crypto.getRandomValues !== 'function'
    || typeof globalThis.fetch !== 'function' || typeof globalThis.AbortController !== 'function')
    fail('UNSUPPORTED');
  let serviceOrigin;
  try { serviceOrigin = inspectOrigin(inspectArgs(options[0], ['serviceOrigin']).serviceOrigin); }
  catch (error) { throw enrollmentClientError(codeOf(error)); }
  const owners = createJournal(), registrations = createRegistrationJournal(), journal = createEnrollmentJournal();
  const controllers = new Set();
  function fence(generation) {
    owners.assertGeneration(generation.owner);
    registrations.assertGeneration(generation.registration);
    journal.assertGeneration(generation.enrollment);
  }
  function capture() {
    const generation = { owner: owners.generation, registration: registrations.generation,
      enrollment: journal.generation };
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
      throw enrollmentClientError(codeOf(error));
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
    const record = inspectEnrollmentRecord(raw);
    if (record.serviceOrigin !== serviceOrigin) fail('CONFLICT');
    const context = await readContext(rootOperationId, generation); fence(generation);
    const verified = await verifyEnrollmentRecord(context.owner, context.registration, record); fence(generation);
    await compareContext(context, generation); fence(generation);
    const same = await journal.compare(rootOperationId, record.revision, enrollmentRecordImage(record)); fence(generation);
    if (!same) fail('CONFLICT');
    return { record, context, receipt: verified.receipt, receiptText: verified.receiptText };
  }
  async function readExpected(record, generation) {
    const checked = await readChecked(record.rootOperationId, generation); fence(generation);
    if (checked.record.revision !== record.revision
      || enrollmentRecordImage(checked.record) !== enrollmentRecordImage(record)) fail('CONFLICT');
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
    const receipt = await sealEnrollmentReceipt(owner, registration, checked.record, result.text); fence(generation);
    const next = inspectEnrollmentRecord({ ...checked.record, revision: checked.record.revision + 1, receipt });
    await compareContext(checked.context, generation); fence(generation);
    try {
      await journal.cas(next.rootOperationId, checked.record.revision, enrollmentRecordImage(checked.record), next); fence(generation);
    } catch (error) {
      fence(generation);
      if (!['ENROLLMENT_CLIENT_CONFLICT', 'ENROLLMENT_CLIENT_FROZEN'].includes(codeOf(error))) throw error;
      const latest = await readChecked(next.rootOperationId, generation); fence(generation);
      if (latest.receipt !== null && latest.receiptText === result.text) return status(latest);
      throw error;
    }
    const retained = await readExpected(next, generation); fence(generation);
    if (retained.receipt === null || retained.receiptText !== result.text) fail('CORRUPT');
    return status(retained);
  }
  return Object.freeze({
    prepareEnrollment(input) {
      return perform(async generation => {
        const args = inspectArgs(input, ['rootOperationId', 'source', 'consent']);
        // These inspectors copy the bytes/frontier and consent synchronously,
        // before hashing, storage or any other await can yield to the caller.
        const source = inspectSource(args.source), consent = inspectConsent(args.consent);
        const digest = await sourceCheckpointDigest(source); fence(generation);
        const existing = await readChecked(args.rootOperationId, generation, true); fence(generation);
        if (existing !== null) {
          matchesSource(existing.record, source, consent, digest);
          return status(existing);
        }
        const context = await readContext(args.rootOperationId, generation); fence(generation);
        const next = inspectEnrollmentRecord(await generateEnrollmentRecord(context.owner, context.registration,
          serviceOrigin, source, consent)); fence(generation);
        matchesSource(next, source, consent, digest);
        if (next.rootOperationId !== args.rootOperationId
          || next.ownerImageDigest !== context.pins.ownerImageDigest
          || next.genesisReceiptDigest !== context.pins.genesisReceiptDigest) fail('CONFLICT');
        await compareContext(context, generation); fence(generation);
        const added = await journal.add(next); fence(generation);
        if (added) return status(await readExpected(next, generation));
        // One native add wins. Different source revisions/checkpoints/frontiers
        // conflict; losing random material is discarded without being sent.
        const latest = await readChecked(args.rootOperationId, generation); fence(generation);
        if (latest.record.ownerImageDigest !== next.ownerImageDigest
          || latest.record.genesisReceiptDigest !== next.genesisReceiptDigest) fail('CONFLICT');
        matchesSource(latest.record, source, consent, digest);
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
    adopt(input) {
      return perform(async generation => {
        const args = inspectArgs(input, ['rootOperationId', 'expectedRevision']);
        let checked = await readChecked(args.rootOperationId, generation); fence(generation);
        expectedRevision(checked, args.expectedRevision);
        if (checked.receipt !== null) fail('FROZEN');
        let resumed;
        try {
          resumed = await request(generation, signal => resumeEnrollmentOperation(checked.context.owner,
            checked.context.registration, checked.record, signal, () => fence(generation))); fence(generation);
        } catch (error) {
          fence(generation);
          if (codeOf(error) !== 'ENROLLMENT_CLIENT_UNCONFIRMED') throw error;
        }
        if (resumed) return retainReceipt(checked, resumed, generation);
        checked = await readExpected(checked.record, generation); fence(generation);
        // Resume always precedes the attempt limit. An exact PROOF_REQUIRED may
        // reflect server/client clock skew, so never reuse the old local proof.
        if (checked.record.attempts.length >= MAX_ENROLLMENT_ATTEMPTS) fail('LIMIT');
        const { owner, registration } = checked.context;
        const statement = await request(generation, signal => requestEnrollmentChallenge(
          checked.record.intent, serviceOrigin, signal, () => fence(generation))); fence(generation);
        const signed = await signEnrollmentProof(owner, registration, checked.record.intent,
          statement, serviceOrigin); fence(generation);
        const next = inspectEnrollmentRecord({ ...checked.record, revision: checked.record.revision + 1,
          attempts: [...checked.record.attempts, { revision: checked.record.revision + 1, proof: signed }] });
        await compareContext(checked.context, generation); fence(generation);
        // A losing CAS cannot dispatch its separately generated signature.
        await journal.cas(args.rootOperationId, checked.record.revision, enrollmentRecordImage(checked.record), next); fence(generation);
        checked = await readExpected(next, generation); fence(generation);
        const proof = checked.record.attempts.at(-1).proof;
        assertEnrollmentFresh(proof.statement);
        const result = await request(generation, signal => submitEnrollmentAdoption(checked.context.owner,
          checked.context.registration, checked.record, proof, signal, () => fence(generation))); fence(generation);
        return retainReceipt(checked, result, generation);
      });
    },
    resumeEnrollment(input) {
      return perform(async generation => {
        const args = inspectArgs(input, ['rootOperationId', 'expectedRevision']);
        const checked = await readChecked(args.rootOperationId, generation); fence(generation);
        expectedRevision(checked, args.expectedRevision);
        const result = await request(generation, signal => resumeEnrollmentOperation(checked.context.owner,
          checked.context.registration, checked.record, signal, () => fence(generation))); fence(generation);
        return retainReceipt(checked, result, generation);
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
