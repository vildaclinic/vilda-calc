// Unloaded protected clinical workspace. The application must explicitly adopt
// a complete source and close this native scope on account/session/lock changes.
// This module never enables production settings or imports a legacy vault.
import { createWorkspaceContext } from './context.mjs';
import { createWorkspaceJournal, headImage } from './journal.mjs';
import { fail, mapped, fields, token, integer, inspectOrigin, inspectSource, randomId, hash, encoder, sealJson, openJson } from './common.mjs';
import { encryptSource, decryptSource, readSourceManifest, inspectObjectText } from './crypto.mjs';
import { inspectIntent, bindIntent } from './wire.mjs';
import { assertFresh } from './authority.mjs';
import { authorizeDevice, readState, readReceipt, readCurrentReceipt, readObject, mutate, parseReceipt, INTENT_DOMAIN } from './protocol.mjs';
import { readHead, readOperation, commit, initialBody, operationBody } from './store.mjs';
import { verifyBootstrapSource } from '../patient-clinical-workspace-source/index.mjs';
import { exportRecoveryPackage } from '../patient-clinical-workspace-recovery/index.mjs';
export { createPatientClinicalWorkspaceRecoveryClient, inspectPortableRecoveryHeader } from '../patient-clinical-workspace-recovery/index.mjs';

function status(head, writeAdmitted = true) {
  if (head === null) return Object.freeze({ status: 'not-admitted', revision: 0, localWriteAvailable: false,
    pendingCount: 0, conflictCount: 0, remoteHeadSeq: 0, bootstrapRequired: true });
  const body = head.body;
  return Object.freeze({ status: !writeAdmitted ? 'admission-required' : body.conflicts.length ? 'conflict' : body.pending.length ? 'pending'
    : body.currentOperationId === null ? 'bootstrap-required' : 'synced', revision: head.row.revision,
  localWriteAvailable: writeAdmitted && body.remote.headSeq >= 1 && body.currentOperationId !== null && body.conflicts.length === 0,
  pendingCount: body.pending.length, conflictCount: body.conflicts.length, remoteHeadSeq: body.remote.headSeq,
  bootstrapRequired: body.remote.headSeq === 0 });
}
function writeArgs(input) {
  const args = fields(input, ['operationId', 'expectedRevision', 'source']);
  if (!token(args.operationId) || !integer(args.expectedRevision, 1)) fail();
  args.source = inspectSource(args.source); return args;
}
/** Factory/import have no storage or transport effects. All providers are
 * native; arbitrary keys, auth claims, snapshots and authority DTOs are refused. */
export function createPatientClinicalWorkspaceClient(...inputs) {
  if (inputs.length !== 1) fail('INVALID');
  if (globalThis.isSecureContext !== true || typeof globalThis.indexedDB?.open !== 'function'
    || !globalThis.crypto?.subtle || typeof globalThis.fetch !== 'function' || typeof globalThis.AbortController !== 'function') fail('UNSUPPORTED');
  const options = fields(inputs[0], ['serviceOrigin', 'rootOperationId']);
  options.serviceOrigin = inspectOrigin(options.serviceOrigin); if (!token(options.rootOperationId)) fail();
  const contexts = createWorkspaceContext(options), journal = createWorkspaceJournal();
  let generation = 0, closed = false, tail = Promise.resolve(), device = null;
  const controllers = new Set();
  function close() {
    if (closed) return;
    closed = true; generation++; device = null;
    for (const controller of controllers) controller.abort();
    contexts.close(); journal.close();
  }
  function perform(action) {
    const token = generation;
    const pending = tail.then(async () => {
      let produced;
      const localGeneration = journal.generation;
      const guard = context => {
        if (closed || generation !== token) fail('CLOSED');
        journal.assertGeneration(localGeneration);
        if (context) contexts.fence(context.generation);
      };
      try {
        guard(); const context = await contexts.read(); guard(context);
        produced = await contexts.withLine(context, async line => {
          const fence = () => guard(context);
          const result = await action(context, line, fence); produced = result; fence();
          await contexts.compare(context); fence(); return result;
        });
        guard(context); return produced;
      } catch (error) {
        for (const source of [produced?.source, produced?.local, produced?.remote]) {
          try { source?.bytes?.fill(0); } catch { /* No unreleased source. */ }
        }
        try { produced?.packetBytes?.fill(0); } catch { /* No unreleased recovery artifact. */ }
        if (closed || generation !== token) fail('CLOSED');
        throw mapped(error);
      }
    });
    tail = pending.catch(() => {}); return pending;
  }
  async function network(guard, action) {
    const controller = new AbortController(); controllers.add(controller);
    try { guard(); const result = await action(controller.signal); guard(); return result; }
    finally { controllers.delete(controller); }
  }
  async function admittedDevice(context, line, guard) {
    if (device !== null) {
      try { assertFresh(device.receipt, 3600); return device; } catch { device = null; }
    }
    const next = await network(guard, signal => authorizeDevice(context, line, signal, guard)); guard();
    device = next; return next;
  }
  async function localObject(context, digest, guard) {
    const value = await journal.readObject(context.binding.rootOperationId, digest); guard();
    if (value === null) fail('CORRUPT'); return value.text;
  }
  async function downloadedObject(context, line, intent, digest, guard) {
    const root = context.binding.rootOperationId;
    const proof = { namespace: 'vilda-workspace-verified-remote-object', protocol: 1,
      bindingDigest: context.bindingDigest, operationId: intent.operationId, ciphertextDigest: digest };
    const aad = 'vilda/clinical-workspace/verified-remote-object/v1\0' + JSON.stringify(proof);
    async function verify(row) {
      if (!row || row.operationId !== intent.operationId || row.digest !== digest
        || JSON.stringify(await openJson(line.payloadKey, row.sealed, aad)) !== JSON.stringify(proof)
        || await hash(row.text) !== digest) fail('CORRUPT'); guard();
      inspectObjectText(row.text); return row.text;
    }
    const retained = await journal.readDownload(root, intent.operationId, digest); guard();
    if (retained !== null) return verify(retained);
    const string = await network(guard, signal => readObject(context, line, digest, signal, guard));
    const sealed = await sealJson(line.payloadKey, proof, aad); guard();
    await journal.retainDownload({ rootOperationId: root, operationId: intent.operationId, digest, text: string, sealed }); guard();
    return verify(await journal.readDownload(root, intent.operationId, digest));
  }
  async function sourceFor(context, line, operation, guard, remote = false, objects = []) {
    const intent = operation.body?.intent ?? operation.intent;
    bindIntent(intent, context.binding, context.enrollment.intent.source.checkpointDigest);
    return decryptSource(line.payloadKey, context.binding, intent.operationId, intent.snapshotId, intent.expectedHeadSeq + 1,
      intent.chunks, intent.manifest, async digest => {
        if (!remote) return localObject(context, digest, guard);
        const string = await downloadedObject(context, line, intent, digest, guard);
        objects.push({ digest, text: string }); return string;
      }, guard);
  }
  async function reuseFor(context, line, operation, guard, cached = null) {
    const intent = operation.body?.intent ?? operation.intent;
    bindIntent(intent, context.binding, context.enrollment.intent.source.checkpointDigest);
    const read = cached ? async digest => {
      const object = cached.find(value => value.digest === digest);
      if (!object) fail('CORRUPT'); return object.text;
    } : digest => localObject(context, digest, guard);
    const manifest = await readSourceManifest(line.payloadKey, context.binding, intent.operationId, intent.snapshotId,
      intent.expectedHeadSeq + 1, intent.chunks, intent.manifest, read, guard);
    return { chunks: manifest.chunks, readObject: read };
  }
  async function checkedCurrent(context, line, head, guard) {
    if (head === null || head.body.currentOperationId === null) fail('NOT_READY');
    const operation = await readOperation(journal, context, line.payloadKey, head.body.currentOperationId, guard);
    if (operation === null) fail('CORRUPT');
    const source = await sourceFor(context, line, operation, guard);
    try {
      if (!await journal.compare(context.binding.rootOperationId, headImage(head.row))) fail('CONFLICT'); guard();
      return { source, revision: head.row.revision, status: status(head, contexts.canWrite(context)) };
    } catch (error) { source.bytes.fill(0); throw error; }
  }
  async function importRemote(context, line, head, remote, guard) {
    if (head.body.pending.length || head.body.conflicts.length) return head;
    if (remote.headSeq === head.body.remote.headSeq && remote.manifestDigest === head.body.remote.manifestDigest) return head;
    if (remote.headSeq <= head.body.remote.headSeq) fail('CONFLICT');
    const receipt = await network(guard, signal => readCurrentReceipt(context, line, remote, signal, guard));
    bindIntent(receipt.intent, context.binding, context.enrollment.intent.source.checkpointDigest);
    const objects = [], source = await sourceFor(context, line, receipt, guard, true, objects);
    source.bytes.fill(0);
    const previous = await readOperation(journal, context, line.payloadKey, receipt.operationId, guard);
    if (previous !== null && previous.body.intentDigest !== receipt.intentDigest) fail('CONFLICT');
    const body = { ...head.body, currentOperationId: receipt.operationId,
      remote: { headSeq: receipt.headSeq, manifestDigest: receipt.manifestDigest, operationId: receipt.operationId } };
    const next = await commit(journal, context, line.payloadKey, head, body, [{ previous,
      body: operationBody(receipt.intent, receipt.intentDigest, 'committed', receipt) }], objects, guard);
    const verified = await checkedCurrent(context, line, next, guard); verified.source.bytes.fill(0);
    await journal.clearDownloads(context.binding.rootOperationId, receipt.operationId); guard();
    return next;
  }
  async function refresh(context, line, guard, admit) {
    let head = await readHead(journal, context, line.payloadKey, guard);
    if (head === null && !admit) fail('NOT_READY');
    const authorized = admit ? await admittedDevice(context, line, guard) : null;
    const remote = await network(guard, signal => readState(context, line, signal, guard));
    if (admit) await contexts.admit(context, authorized.receipt);
    if (head === null) head = await commit(journal, context, line.payloadKey, null,
      initialBody(context, authorized.receipt), [], [], guard);
    return status(await importRemote(context, line, head, remote, guard), admit || contexts.canWrite(context));
  }
  async function prepare(args, bootstrap, context, line, guard) {
    if (!contexts.canWrite(context)) fail('NOT_READY');
    const head = await readHead(journal, context, line.payloadKey, guard);
    if (head === null || head.row.revision !== args.expectedRevision) fail('CONFLICT');
    if (head.body.conflicts.length) fail('CONFLICT');
    if (bootstrap ? head.body.currentOperationId !== null || head.body.remote.headSeq !== 0
      : head.body.currentOperationId === null || head.body.remote.headSeq === 0) fail('NOT_READY');
    if (head.body.pending.length >= 256) fail('LIMIT');
    const existing = await readOperation(journal, context, line.payloadKey, args.operationId, guard);
    if (existing !== null) fail('CONFLICT'); // Exact retries resume the retained immutable operation.
    if (bootstrap) {
      const enrolled = await contexts.firstSource(context); guard();
      try { await verifyBootstrapSource(enrolled, args.source); guard(); }
      finally { enrolled.bytes.fill(0); }
    }
    let parent = head.body.remote, reuse = null;
    if (head.body.currentOperationId !== null) {
      const current = await readOperation(journal, context, line.payloadKey, head.body.currentOperationId, guard);
      if (current === null) fail('CORRUPT');
      parent = { headSeq: current.body.intent.expectedHeadSeq + 1, manifestDigest: current.body.intent.manifest.ciphertextDigest };
      reuse = await reuseFor(context, line, current, guard);
    }
    const encrypted = await encryptSource(line.payloadKey, context.binding, args.operationId, randomId(), parent.headSeq + 1, args.source, guard, reuse);
    const b = context.binding;
    const intent = inspectIntent({ namespace: 'vilda-clinical-workspace-intent', protocol: 1, purpose: 'publish-checkpoint',
      accountRootId: b.accountRootId, enrollmentOperationId: b.enrollmentOperationId, enrollmentIntentDigest: b.enrollmentIntentDigest,
      operationId: args.operationId, slotId: b.slotId, authorityId: b.authorityId, keyBinding: b.keyBinding, epoch: b.epoch,
      snapshotId: encrypted.snapshotId, expectedHeadSeq: parent.headSeq, expectedManifestDigest: parent.manifestDigest,
      sourceCheckpointDigest: context.enrollment.intent.source.checkpointDigest, manifest: encrypted.manifest, chunks: encrypted.chunks });
    const intentDigest = await hash(INTENT_DOMAIN + JSON.stringify(intent)); guard();
    const next = await commit(journal, context, line.payloadKey, head,
      { ...head.body, currentOperationId: args.operationId, pending: [...head.body.pending, args.operationId] },
      [{ previous: null, body: operationBody(intent, intentDigest) }], encrypted.objects, guard);
    const verified = await checkedCurrent(context, line, next, guard); verified.source.bytes.fill(0);
    return Object.freeze({ operationId: args.operationId, revision: next.row.revision, status: 'pending' });
  }
  async function retain(context, line, head, operation, receipt, guard) {
    const conflict = receipt.status === 'CONFLICT';
    if (!conflict && receipt.status !== 'COMMITTED') fail('CORRUPT');
    if (!conflict) {
      // A successful receipt alone cannot make the local UI claim synced:
      // fetch, authenticate and decrypt every accepted server object first.
      const source = await sourceFor(context, line, receipt, guard, true); source.bytes.fill(0);
    }
    const body = conflict ? { ...head.body,
      pending: head.body.pending.filter(id => id !== receipt.operationId), conflicts: [...head.body.conflicts, receipt.operationId] }
      : { ...head.body, pending: head.body.pending.filter(id => id !== receipt.operationId),
        remote: { headSeq: receipt.headSeq, manifestDigest: receipt.manifestDigest, operationId: receipt.operationId } };
    const next = await commit(journal, context, line.payloadKey, head, body, [{ previous: operation,
      body: { ...operation.body, status: conflict ? 'conflict' : 'committed', receipt } }], [], guard);
    if (!conflict) { await journal.clearDownloads(context.binding.rootOperationId, receipt.operationId); guard(); }
    return next;
  }
  async function flush(context, line, guard) {
    if (!contexts.canWrite(context)) fail('NOT_READY');
    let head = await readHead(journal, context, line.payloadKey, guard);
    if (head === null) fail('NOT_READY');
    if (head.body.conflicts.length || !head.body.pending.length) return status(head);
    const authorization = await admittedDevice(context, line, guard);
    while (head.body.pending.length && !head.body.conflicts.length) {
      const operationId = head.body.pending[0];
      let operation = await readOperation(journal, context, line.payloadKey, operationId, guard);
      if (operation === null || !['pending', 'dispatched'].includes(operation.body.status)) fail('CORRUPT');
      if (operation.body.status === 'pending') {
        head = await commit(journal, context, line.payloadKey, head, head.body,
          [{ previous: operation, body: { ...operation.body, status: 'dispatched' } }], [], guard);
        operation = await readOperation(journal, context, line.payloadKey, operationId, guard);
      }
      const { intent, intentDigest } = operation.body;
      let receipt;
      try { receipt = await network(guard, signal => readReceipt(context, line, intent, intentDigest, signal, guard)); }
      catch (error) { if (error?.code !== 'WORKSPACE_CLIENT_MISSING') throw error; }
      if (receipt === undefined) receipt = parseReceipt(await network(guard,
        signal => mutate(context, line, authorization, 'reserve', intent, signal, guard)), intent, intentDigest);
      if (receipt.status === 'RESERVED') {
        const references = [...intent.chunks, intent.manifest];
        for (const reference of references) {
          if (receipt.uploaded.includes(reference.ciphertextDigest)) continue;
          const string = await localObject(context, reference.ciphertextDigest, guard);
          if (await hash(string) !== reference.ciphertextDigest || encoder.encode(string).length !== reference.bytes) fail('CORRUPT'); guard();
          const envelope = inspectObjectText(string);
          const result = await network(guard, signal => mutate(context, line, authorization, 'objects',
            { operationId, intentDigest, envelope }, signal, guard));
          if (result.ciphertextDigest !== reference.ciphertextDigest) fail('CORRUPT');
        }
        receipt = parseReceipt(await network(guard, signal => mutate(context, line, authorization, 'finalize',
          { operationId, intentDigest }, signal, guard)), intent, intentDigest);
      }
      head = await retain(context, line, head, operation, receipt, guard);
    }
    return status(head);
  }
  const sourceWrite = (input, bootstrap) => {
    const args = writeArgs(input);
    return perform((context, line, guard) => prepare(args, bootstrap, context, line, guard))
      .finally(() => args.source.bytes.fill(0));
  };
  function resolutionWrite(input) {
    const values = fields(input, ['operationId', 'expectedRevision', 'remoteHeadSeq', 'remoteManifestDigest', 'source']);
    const args = writeArgs({ operationId: values.operationId, expectedRevision: values.expectedRevision, source: values.source });
    if (!integer(values.remoteHeadSeq, 1) || typeof values.remoteManifestDigest !== 'string') { args.source.bytes.fill(0); fail(); }
    return perform(async (context, line, guard) => {
      if (!contexts.canWrite(context)) fail('NOT_READY');
      const head = await readHead(journal, context, line.payloadKey, guard);
      if (head === null || head.row.revision !== args.expectedRevision || !head.body.conflicts.length) fail('CONFLICT');
      if (await readOperation(journal, context, line.payloadKey, args.operationId, guard) !== null) fail('CONFLICT');
      const state = await network(guard, signal => readState(context, line, signal, guard));
      if (state.headSeq !== values.remoteHeadSeq || state.manifestDigest !== values.remoteManifestDigest) fail('CONFLICT');
      const receipt = await network(guard, signal => readCurrentReceipt(context, line, state, signal, guard));
      const objects = [], remoteSource = await sourceFor(context, line, receipt, guard, true, objects); remoteSource.bytes.fill(0);
      const changes = [];
      // Every discarded branch remains encrypted and addressable. Resolution is
      // a NEW reviewed operation on the exact observed remote parent, never an
      // edit/rebase of a previously dispatched intent.
      for (const id of [...head.body.pending, ...head.body.conflicts]) {
        const previous = await readOperation(journal, context, line.payloadKey, id, guard);
        if (previous === null) fail('CORRUPT');
        changes.push({ previous, body: { ...previous.body, status: 'superseded' } });
      }
      const existingRemote = await readOperation(journal, context, line.payloadKey, receipt.operationId, guard);
      if (existingRemote === null) changes.push({ previous: null,
        body: operationBody(receipt.intent, receipt.intentDigest, 'committed', receipt) });
      else if (existingRemote.body.intentDigest !== receipt.intentDigest) fail('CONFLICT');
      const reuse = await reuseFor(context, line, receipt, guard, objects);
      const encrypted = await encryptSource(line.payloadKey, context.binding, args.operationId, randomId(), state.headSeq + 1, args.source, guard, reuse);
      const b = context.binding;
      const intent = inspectIntent({ namespace: 'vilda-clinical-workspace-intent', protocol: 1, purpose: 'publish-checkpoint',
        accountRootId: b.accountRootId, enrollmentOperationId: b.enrollmentOperationId, enrollmentIntentDigest: b.enrollmentIntentDigest,
        operationId: args.operationId, slotId: b.slotId, authorityId: b.authorityId, keyBinding: b.keyBinding, epoch: b.epoch,
        snapshotId: encrypted.snapshotId, expectedHeadSeq: state.headSeq, expectedManifestDigest: state.manifestDigest,
        sourceCheckpointDigest: context.enrollment.intent.source.checkpointDigest, manifest: encrypted.manifest, chunks: encrypted.chunks });
      const digest = await hash(INTENT_DOMAIN + JSON.stringify(intent)); guard();
      changes.push({ previous: null, body: operationBody(intent, digest) });
      const next = await commit(journal, context, line.payloadKey, head, { ...head.body,
        currentOperationId: args.operationId, pending: [args.operationId], conflicts: [],
        remote: { headSeq: state.headSeq, manifestDigest: state.manifestDigest, operationId: receipt.operationId } },
      changes, [...objects, ...encrypted.objects], guard);
      const verified = await checkedCurrent(context, line, next, guard); verified.source.bytes.fill(0);
      await journal.clearDownloads(context.binding.rootOperationId, receipt.operationId); guard();
      return { operationId: args.operationId, revision: next.row.revision, status: 'pending' };
    }).finally(() => args.source.bytes.fill(0));
  }
  return Object.freeze({
    open: () => perform((context, line, guard) => refresh(context, line, guard, true)),
    readStatus: () => perform(async (context, line, guard) => status(await readHead(journal, context, line.payloadKey, guard), contexts.canWrite(context))),
    readCurrent: () => perform(async (context, line, guard) => checkedCurrent(context, line,
      await readHead(journal, context, line.payloadKey, guard), guard)),
    prepareBootstrap: input => sourceWrite(input, true),
    prepareWrite: input => sourceWrite(input, false),
    prepareResolution: resolutionWrite,
    readOperationOutcome: input => {
      const args = fields(input, ['operationId']); if (!token(args.operationId)) fail();
      return perform(async (context, line, guard) => {
        const head = await readHead(journal, context, line.payloadKey, guard);
        if (head === null) fail('NOT_READY');
        const operation = await readOperation(journal, context, line.payloadKey, args.operationId, guard);
        if (operation === null) {
          if (!await journal.compare(context.binding.rootOperationId, headImage(head.row))) fail('CONFLICT'); guard();
          return null;
        }
        const source = await sourceFor(context, line, operation, guard);
        try {
          if (!await journal.compare(context.binding.rootOperationId, headImage(head.row))) fail('CONFLICT'); guard();
          return Object.freeze({ operationId: args.operationId, sourceRevision: source.sourceRevision,
            expectedHeadSeq: operation.body.intent.expectedHeadSeq,
            expectedManifestDigest: operation.body.intent.expectedManifestDigest,
            status: operation.body.status, isCurrent: head.body.currentOperationId === args.operationId,
            workspaceStatus: status(head, contexts.canWrite(context)) });
        } finally { source.bytes.fill(0); }
      });
    },
    flush: () => perform(flush), resume: () => perform(flush),
    refresh: () => perform((context, line, guard) => refresh(context, line, guard, false)),
    exportRecovery: () => perform(async (context, line, guard) => {
      const head = await readHead(journal, context, line.payloadKey, guard);
      if (head === null || head.body.remote.headSeq < 1) fail('NOT_READY');
      const records = await journal.exportRecords(context.binding.rootOperationId); guard();
      if (records.head === null || headImage(records.head) !== headImage(head.row)) fail('CONFLICT');
      const packet = await exportRecoveryPackage(context, records, guard); guard();
      if (!await journal.compare(context.binding.rootOperationId, headImage(head.row))) fail('CONFLICT'); guard();
      return packet;
    }),
    inspectConflict: () => perform(async (context, line, guard) => {
      let head = await readHead(journal, context, line.payloadKey, guard);
      if (head === null || !head.body.conflicts.length) fail('NOT_READY');
      const local = await checkedCurrent(context, line, head, guard);
      try {
        const state = await network(guard, signal => readState(context, line, signal, guard));
        const receipt = await network(guard, signal => readCurrentReceipt(context, line, state, signal, guard));
        const objects = [], remoteSource = await sourceFor(context, line, receipt, guard, true, objects);
        try {
          const retained = await readOperation(journal, context, line.payloadKey, receipt.operationId, guard);
          if (retained === null) head = await commit(journal, context, line.payloadKey, head, head.body,
            [{ previous: null, body: operationBody(receipt.intent, receipt.intentDigest, 'committed', receipt) }], objects, guard);
          else if (retained.body.intentDigest !== receipt.intentDigest || retained.body.status !== 'committed') fail('CONFLICT');
          await journal.clearDownloads(context.binding.rootOperationId, receipt.operationId); guard();
          if (!await journal.compare(context.binding.rootOperationId, headImage(head.row))) fail('CONFLICT'); guard();
        } catch (error) { remoteSource.bytes.fill(0); throw error; }
        return { revision: head.row.revision, local: local.source, remote: remoteSource,
          remoteHeadSeq: state.headSeq, remoteManifestDigest: state.manifestDigest, conflictOperationIds: [...head.body.conflicts] };
      } catch (error) { local.source.bytes.fill(0); throw error; }
    }),
    close
  });
}
