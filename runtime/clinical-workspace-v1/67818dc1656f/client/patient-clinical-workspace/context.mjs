// Only this internal boundary opens actual retained owner/enrollment journals.
// Caller DTOs, legacy vault candidates and read-only recovery results are never
// accepted as owner or mutable-clinical authority.
import { createJournal } from '../account-root/journal.mjs';
import { inspectRecord, recordImage } from '../account-root/codec.mjs';
import { createRegistrationJournal } from '../account-root-registration/journal.mjs';
import { inspectRegistrationRecord, registrationImage } from '../account-root-registration/format.mjs';
import { createEnrollmentJournal } from '../patient-identity-enrollment/journal.mjs';
import { inspectEnrollmentRecord, enrollmentRecordImage } from '../patient-identity-enrollment/format.mjs';
import { verifyEnrollmentRecord } from '../patient-identity-enrollment/protocol.mjs';
import { generateSnapshotRecord, exportClinicalRecoveryArtifact, openClinicalRecoverySeed,
  deriveClinicalRecoveryLocator, openClinicalRecoveryIdentity, openClinicalRecoverySource } from '../patient-clinical-snapshot/crypto.mjs';
import { fail, fields, token, inspectOrigin, hash, encoder } from './common.mjs';
import { createRecoveredWorkspaceContext, admitRecoveredContext } from '../patient-clinical-workspace-recovery/context.mjs';

export function createWorkspaceContext(input) {
  const options = fields(input, ['serviceOrigin', 'rootOperationId']);
  const serviceOrigin = inspectOrigin(options.serviceOrigin), rootOperationId = options.rootOperationId;
  if (!token(rootOperationId)) fail();
  const owners = createJournal(), registrations = createRegistrationJournal();
  const enrollments = createEnrollmentJournal();
  const journals = [owners, registrations, enrollments];
  const recovery = createRecoveredWorkspaceContext(options), recoveredContexts = new WeakSet();
  const capture = () => journals.map(journal => journal.generation);
  const fence = generation => Array.isArray(generation)
    ? journals.forEach((journal, i) => journal.assertGeneration(generation[i])) : recovery.fence(generation);
  async function compare(context) {
    if (recoveredContexts.has(context)) {
      if (await owners.read(rootOperationId) !== null) fail('CONFLICT');
      return recovery.compare(context);
    }
    const expected = [context.owner, context.registration, context.enrollment];
    for (let i = 0; i < journals.length; i++) {
      if (!await journals[i].compare(rootOperationId, expected[i].revision, context.images[i])) fail('CONFLICT');
      fence(context.generation);
    }
  }
  async function read() {
    const generation = capture(); fence(generation);
    const records = [];
    for (const journal of journals) {
      const record = await journal.read(rootOperationId); fence(generation);
      if (record === null) {
        // Recovery is a separately verified native sealed context. It is only
        // consulted when no original owner row exists; corrupt or incomplete
        // old rows never fall through to an alternate authority path.
        if (journal !== owners) fail('NOT_READY');
        const recovered = await recovery.read(); fence(generation);
        if (recovered === null) fail('NOT_READY');
        recoveredContexts.add(recovered); await compare(recovered); return recovered;
      }
      records.push(record);
    }
    const owner = inspectRecord(records[0]), registration = inspectRegistrationRecord(records[1]);
    const enrollment = inspectEnrollmentRecord(records[2]);
    if (owner.operationId !== rootOperationId || registration.operationId !== rootOperationId
      || enrollment.rootOperationId !== rootOperationId
      || [registration, enrollment].some(record => record.serviceOrigin !== serviceOrigin)) fail('CONFLICT');
    const enrolled = await verifyEnrollmentRecord(owner, registration, enrollment); fence(generation);
    if (enrolled.receipt === null) fail('NOT_READY');
    const binding = { rootOperationId, serviceOrigin, accountRootId: owner.intent.accountRootId,
      genesisIntentDigest: owner.intentDigest, enrollmentOperationId: enrollment.intent.operationId,
      enrollmentIntentDigest: enrollment.intentDigest, slotId: enrollment.intent.anchor.slotId,
      authorityId: enrollment.intent.anchor.authorityId, keyBinding: enrollment.intent.anchor.keyBinding,
      epoch: enrollment.intent.anchor.epoch };
    const bindingDigest = await hash('vilda/clinical-workspace/local-binding/v1\0' + JSON.stringify(binding)); fence(generation);
    const context = { owner, registration, enrollment, binding, bindingDigest, generation,
      images: [recordImage(owner), registrationImage(registration), enrollmentRecordImage(enrollment)] };
    await compare(context); fence(generation);
    return context;
  }
  async function withLine(context, action) {
    if (recoveredContexts.has(context)) {
      await compare(context);
      const result = await recovery.withLine(context, action);
      await compare(context); return result;
    }
    await compare(context); fence(context.generation);
    // Internal recovery primitives retain the exact same clinical DEK+SIS.
    // This operation derives keys; the new server grant separately authorizes
    // mutations. No former recovery DTO is elevated into write authority.
    // Build an internal transient first-snapshot record to reuse the existing
    // verified enrollment secret decoder. It is never persisted, dispatched or
    // treated as admission; its random publication/recovery IDs are not binding.
    const snapshot = await generateSnapshotRecord(context.owner, context.registration, context.enrollment, serviceOrigin);
    fence(context.generation);
    const artifact = await exportClinicalRecoveryArtifact(snapshot); fence(context.generation);
    const seed = await openClinicalRecoverySeed(artifact.packetText, artifact.recoveryCode, serviceOrigin);
    try {
      fence(context.generation);
      const lookup = await deriveClinicalRecoveryLocator(seed.dek); fence(context.generation);
      const anchor = seed.packet.enrollmentAnchor, envelope = context.enrollment.intent.capsuleEnvelope;
      const locator = { ...anchor, capsule: { ciphertextDigest: anchor.capsuleDigest,
        bytes: encoder.encode(JSON.stringify(envelope)).length, envelope } };
      const line = await openClinicalRecoveryIdentity(seed.dek, seed.packet, locator, lookup); fence(context.generation);
      if (line.slotId !== context.binding.slotId || line.keyBinding !== context.binding.keyBinding) fail('CONFLICT');
      const result = await action(line, snapshot); fence(context.generation);
      await compare(context); fence(context.generation);
      return result;
    } finally { seed.dek.fill(0); }
  }
  async function firstSource(context) {
    if (recoveredContexts.has(context)) return recovery.firstSource(context);
    return withLine(context, (line, snapshot) => openClinicalRecoverySource(line, {
      intent: snapshot.intent, intentDigest: snapshot.intentDigest,
      enrollmentAnchor: context.enrollment.intent.anchor }, snapshot.envelope));
  }
  return Object.freeze({ read, compare, withLine, firstSource, fence,
    canWrite: context => !recoveredContexts.has(context) || context.recoveryAdmitted === true,
    async admit(context, receipt) {
      if (recoveredContexts.has(context)) { await compare(context); await admitRecoveredContext(context, receipt); await compare(context); }
    },
    close() { for (const journal of journals) journal.close(); recovery.close(); } });
}
