import { createWorkspaceContext } from '../patient-clinical-workspace/context.mjs';
import { createWorkspaceJournal, headImage } from '../patient-clinical-workspace/journal.mjs';
import { fields, fail, token, inspectOrigin, mapped } from '../patient-clinical-workspace/common.mjs';
import { extractRecoveryMaterial } from './material.mjs';
import { exportRecoveredMaterial, retainRecoveredMaterial, markRecoveredInstalled,
  createRecoveredWorkspaceContext } from './context.mjs';
import { createPortableRecoveryPackage, openPortableRecoveryPackage, verifyRecoveryJournal } from './package.mjs';
import { verifyRecoveryMaterial } from './material.mjs';
import { bytesCopy } from '../patient-clinical-workspace-source/common.mjs';
import { MAX_PACKAGE_BYTES } from './package.mjs';
export { inspectPortableRecoveryHeader } from './package.mjs';

/** Internal caller must have obtained context from the retained native context
 * factory. Original contexts are cryptographically reverified; recovered ones
 * must carry this module's private live handle, never a caller proof flag. */
export async function exportRecoveryPackage(context, records, guard = () => {}) {
  guard();
  const material = context.recovered
    ? await exportRecoveredMaterial(context) : await extractRecoveryMaterial(context, guard);
  guard(); return createPortableRecoveryPackage(material, records, guard);
}
export function createPatientClinicalWorkspaceRecoveryClient(input) {
  if (arguments.length !== 1 || globalThis.isSecureContext !== true || typeof globalThis.indexedDB?.open !== 'function'
    || !globalThis.crypto?.subtle) fail('UNSUPPORTED');
  const options = fields(input, ['serviceOrigin', 'rootOperationId']);
  options.serviceOrigin = inspectOrigin(options.serviceOrigin); if (!token(options.rootOperationId)) fail();
  const contexts = createWorkspaceContext(options), journal = createWorkspaceJournal();
  let closed = false, generation = 0, tail = Promise.resolve();
  function close() { if (!closed) { closed = true; generation++; contexts.close(); journal.close(); } }
  function perform(action) {
    const token = generation;
    const guard = () => { if (closed || token !== generation) fail('CLOSED'); };
    const pending = tail.then(async () => {
      try { guard(); return await action(guard); }
      catch (error) { guard(); throw mapped(error); }
    });
    tail = pending.catch(() => {}); return pending;
  }
  function pinnedInput(input) {
    const args = fields(input, ['packetBytes', 'recoveryCode']);
    if (typeof args.recoveryCode !== 'string') fail();
    args.packetBytes = bytesCopy(args.packetBytes, MAX_PACKAGE_BYTES); return args;
  }
  return Object.freeze({
    createRecoveryPackage() {
      if (arguments.length) { try { fail(); } catch (error) { return Promise.reject(error); } }
      return perform(async guard => {
        const context = await contexts.read(); guard();
        if (context === null) fail('NOT_READY');
        const records = await journal.exportRecords(options.rootOperationId); guard();
        if (records.head === null) fail('NOT_READY');
        const artifact = await exportRecoveryPackage(context, records, guard);
        try {
          guard(); await contexts.compare(context); guard();
          if (!await journal.compare(options.rootOperationId, headImage(records.head))) fail('CONFLICT'); guard();
          return artifact;
        } catch (error) { artifact.packetBytes.fill(0); throw error; }
      });
    },
    previewRecoveryPackage(input) {
      let args;
      try { args = pinnedInput(input); } catch (error) { return Promise.reject(mapped(error)); }
      return perform(async guard => {
        const recovered = await openPortableRecoveryPackage(args, options.serviceOrigin, guard); guard();
        if (recovered.binding.rootOperationId !== options.rootOperationId) fail('CONFLICT');
        return Object.freeze({ rootOperationId: recovered.binding.rootOperationId,
          accountRootId: recovered.binding.accountRootId, ...recovered.summary,
          packageVerified: true, writeAvailable: false });
      }).finally(() => args.packetBytes.fill(0));
    },
    importRecoveryPackage(input) {
      let args;
      try { args = pinnedInput(input); } catch (error) { return Promise.reject(mapped(error)); }
      return perform(async guard => {
        const recovered = await openPortableRecoveryPackage(args, options.serviceOrigin, guard); guard();
        if (recovered.binding.rootOperationId !== options.rootOperationId) fail('CONFLICT');
        const retained = await retainRecoveredMaterial(recovered.material, recovered.packetDigest, guard); guard();
        // A completed import may already have advanced through pending-write
        // dispatch or synchronization before a later reply was lost. Exact
        // retry verifies that current history; it never rolls it back to the
        // older packet image. An uninstalled import still requires exact restore.
        if (!retained.installed) { await journal.restoreRecords(recovered.records); guard(); }
        const records = await journal.exportRecords(options.rootOperationId); guard();
        const verified = await verifyRecoveryMaterial(recovered.material, options.serviceOrigin); guard();
        await verifyRecoveryJournal(verified, records, guard); guard();
        await markRecoveredInstalled(options.rootOperationId, recovered.packetDigest, guard); guard();
        const recoveredContexts = createRecoveredWorkspaceContext(options);
        try {
          const context = await recoveredContexts.read(); guard();
          if (!context || context.bindingDigest !== recovered.bindingDigest) fail('CONFLICT');
          return Object.freeze({ rootOperationId: options.rootOperationId,
            accountRootId: context.binding.accountRootId, status: 'recovered-needs-admission', writeAvailable: false });
        } finally { recoveredContexts.close(); }
      }).finally(() => args.packetBytes.fill(0));
    },
    close
  });
}
export { createNativeRecoveryProvider } from './provider.mjs';
export { showWorkspaceRecovery } from './dialog.mjs';
