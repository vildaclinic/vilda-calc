// Explicit first-use ceremony. Native account keys and source capture stay in
// the caller's private vault closure. The legacy source is never overwritten.
import { createAccountRootClient } from '../account-root/index.mjs';
import { createAccountRootRegistrationClient } from '../account-root-registration/index.mjs';
import { createAccountOwnerClient } from '../account-owner/index.mjs';
import { createPatientIdentityEnrollmentClient } from '../patient-identity-enrollment/index.mjs';
import { createPatientClinicalWorkspaceClient } from '../patient-clinical-workspace/index.mjs';
import { prepareBootstrapSource, readBootstrapSource } from '../patient-clinical-workspace-source/bootstrap.mjs';
import { verifyWorkspaceSource, workspaceDigests } from '../patient-clinical-workspace-source/codec.mjs';

function fail(code) { throw Object.assign(new Error('Przygotowanie planów nie zostało zakończone. Dane źródłowe pozostają zachowane.'), { code }); }
function serializeSource(source) { return { ...source, bytes: Array.from(source.bytes), offlineFrontier: [] }; }
function deserializeSource(source) { return { ...source, bytes: new Uint8Array(source.bytes), offlineFrontier: [] }; }
const clone = value => JSON.parse(JSON.stringify(value));

/** loadSetup/saveSetup use a separate native encrypted marker journal. They
 * must perform CAS and await transaction.oncomplete; these callbacks are not
 * exposed through the application API. runExclusive drains ordinary writers. */
export function createWorkspaceOnboarding(options) {
  const { serviceOrigin, assertCurrent, captureSource, storageOptions, loadSetup,
    saveSetup, runExclusive, activate, createRecoveryPackage, newId } = options;
  const roots = createAccountRootClient(), registrations = createAccountRootRegistrationClient({ serviceOrigin });
  const owners = createAccountOwnerClient({ serviceOrigin });
  const enrollments = createPatientIdentityEnrollmentClient({ serviceOrigin });
  let client = null, closed = false, queue = Promise.resolve();
  const check = () => { if (closed) fail('WORKSPACE_SETUP_CLOSED'); assertCurrent(); };
  function run(action) {
    const task = queue.then(async () => { check(); const result = await action(); check(); return result; });
    queue = task.catch(() => {}); return task;
  }
  async function read() { const state = await loadSetup(); check(); return state; }
  async function persist(previous, next) {
    check(); await saveSetup(previous, next); check();
    const actual = await read();
    if (JSON.stringify(actual) !== JSON.stringify(next)) fail('WORKSPACE_SETUP_UNCONFIRMED');
    return actual;
  }
  async function getClient(state) {
    check();
    if (!client) client = createPatientClinicalWorkspaceClient({ serviceOrigin, rootOperationId: state.rootOperationId });
    return client;
  }
  async function prepare() {
    let state = await read();
    if (state) return { phase: state.phase, ready: state.phase === 'active' };
    return runExclusive(async () => {
      check();
      const source = await captureSource(); check();
      try {
        const bootstrap = await prepareBootstrapSource(source, storageOptions()); check();
        let root = await roots.createDraft(); check();
        const recovery = await roots.createRecoveryPackage({ operationId: root.operationId, expectedRevision: root.revision }); check();
        root = await roots.verifyRecoveryPackage({ operationId: root.operationId, expectedRevision: recovery.status.revision,
          packetText: recovery.packetText, recoveryCode: recovery.recoveryCode }); check();
        const hashes = await workspaceDigests(await verifyWorkspaceSource(source)); check();
        state = await persist(null, { version: 1, phase: 'prepared', rootOperationId: root.operationId,
          bootstrapOperationId: newId(), bootstrap: serializeSource(bootstrap),
          sourceRevision: source.sourceRevision, operationalDigest: hashes.operationalDigest,
          ownerRecovery: { packetText: recovery.packetText, recoveryCode: recovery.recoveryCode }, backupRevision: null, pendingBackup: null });
        return { phase: state.phase, ready: false };
      } finally { source.bytes.fill(0); }
    });
  }
  async function publish(consent) {
    if (consent !== true) fail('WORKSPACE_SETUP_CONSENT_REQUIRED');
    let state = await read();
    if (!state) { await prepare(); state = await read(); }
    if (state.phase === 'active') return { phase: 'active', ready: true };
    if (['published', 'backup-ready'].includes(state.phase)) {
      // A previous backup may have advanced the complete source. Reopening the
      // ceremony must not compare that valid revision to the initial manifest.
      const workspace = await getClient(state), status = await workspace.open(); check();
      if (status.bootstrapRequired || status.conflictCount || !status.localWriteAvailable) fail('WORKSPACE_SETUP_UNCONFIRMED');
      return { phase: state.phase, ready: false };
    }
    let registration = await registrations.prepareRegistration({ operationId: state.rootOperationId }); check();
    if (!registration.receiptRetained) {
      registration = await registrations.register({ operationId: state.rootOperationId, expectedRevision: registration.revision }); check();
    }
    if (!registration.receiptRetained) fail('WORKSPACE_SETUP_UNCONFIRMED');
    // Genesis registration establishes a root, not its owner role. The real
    // owner client retains one exact intent in its own native journal and its
    // establish method first resumes any unknown prior server outcome.
    let owner = await owners.prepareEstablishment({ rootOperationId: state.rootOperationId }); check();
    if (!owner.receiptRetained) {
      owner = await owners.establish({ rootOperationId: state.rootOperationId, expectedRevision: owner.revision }); check();
    }
    if (!owner.receiptRetained || !owner.roleEstablished) fail('WORKSPACE_SETUP_UNCONFIRMED');
    const retainedOwner = await owners.readStatus({ rootOperationId: state.rootOperationId }); check();
    if (!retainedOwner?.receiptRetained || !retainedOwner.roleEstablished
        || retainedOwner.ownerOperationId !== owner.ownerOperationId
        || retainedOwner.rootOperationId !== state.rootOperationId) fail('WORKSPACE_SETUP_UNCONFIRMED');
    // This historical receipt is only a prerequisite. Enrollment still makes
    // its own fresh, purpose-scoped authority request through the native client.
    const bootstrap = deserializeSource(state.bootstrap);
    let source = null;
    try {
      // Reauthenticate the complete durable source BEFORE adopting the small
      // manifest. A missing chunk never becomes an empty checkpoint.
      source = await readBootstrapSource(bootstrap, storageOptions()); check();
      let enrollment = await enrollments.prepareEnrollment({ rootOperationId: state.rootOperationId, source: bootstrap,
        consent: { adoptNewLine: true, recoverSisWithDek: true, freshIndependentKeys: true } }); check();
      if (!enrollment.receiptRetained) {
        enrollment = await enrollments.adopt({ rootOperationId: state.rootOperationId, expectedRevision: enrollment.revision }); check();
      }
      if (!enrollment.receiptRetained) fail('WORKSPACE_SETUP_UNCONFIRMED');
      const workspace = await getClient(state);
      let status = await workspace.open(); check();
      if (status.bootstrapRequired && status.pendingCount === 0) {
        await workspace.prepareBootstrap({ operationId: state.bootstrapOperationId, expectedRevision: status.revision, source }); check();
      }
      status = await workspace.flush(); check();
      if (status.bootstrapRequired || status.pendingCount || status.conflictCount || !status.localWriteAvailable)
        fail('WORKSPACE_SETUP_UNCONFIRMED');
      const current = await workspace.readCurrent(); check();
      try {
        if (current.source.sourceRevision !== source.sourceRevision) fail('WORKSPACE_SETUP_CONFLICT');
      } finally { current.source.bytes.fill(0); }
      state = await persist(state, { ...state, phase: 'published' });
      return { phase: state.phase, ready: false };
    } finally { source?.bytes.fill(0); bootstrap.bytes.fill(0); }
  }
  async function backup() {
    let state = await read();
    if (!state || !['published', 'backup-ready', 'active'].includes(state.phase)) fail('WORKSPACE_SETUP_NOT_READY');
    const workspace = await getClient(state);
    return runExclusive(async () => {
      check();
      async function checkedCurrent(expectedSourceRevision) {
        const current = await workspace.readCurrent(); check();
        if (current.status.conflictCount || current.status.bootstrapRequired || !current.status.localWriteAvailable
            || expectedSourceRevision && current.source.sourceRevision !== expectedSourceRevision) {
          current.source.bytes.fill(0); fail('WORKSPACE_SETUP_CONFLICT');
        }
        return current;
      }
      async function reconcilePending() {
        const pending = state.pendingBackup;
        if (!pending) return;
        let current = await checkedCurrent();
        try {
          if (current.source.sourceRevision !== pending.sourceRevision) {
            if (current.source.sourceRevision !== state.sourceRevision || current.revision !== pending.expectedRevision
                || current.status.pendingCount) fail('WORKSPACE_SETUP_CONFLICT');
            const manifest = deserializeSource(pending.bootstrap);
            let retainedSource = null;
            try {
              retainedSource = await readBootstrapSource(manifest, storageOptions()); check();
              if (retainedSource.sourceRevision !== pending.sourceRevision) fail('WORKSPACE_SETUP_CONFLICT');
              await workspace.prepareWrite({ operationId: pending.operationId, expectedRevision: pending.expectedRevision, source: retainedSource }); check();
            } finally { manifest.bytes.fill(0); retainedSource?.bytes.fill(0); }
          }
        } finally { current.source.bytes.fill(0); }
        const status = await workspace.flush(); check();
        if (status.pendingCount || status.conflictCount || !status.localWriteAvailable) fail('WORKSPACE_SETUP_UNCONFIRMED');
        current = await checkedCurrent(pending.sourceRevision);
        try {
          if (current.status.pendingCount) fail('WORKSPACE_SETUP_UNCONFIRMED');
          state = await persist(state, { ...state, sourceRevision: pending.sourceRevision,
            operationalDigest: pending.operationalDigest, backupRevision: null, pendingBackup: null });
        } finally { current.source.bytes.fill(0); }
      }
      await reconcilePending();
      // Once activated, the protected workspace is authoritative. A later
      // recovery export must not overwrite it from the retained legacy image.
      const source = state.phase === 'active' ? null : await captureSource(); check();
      try {
        const hashes = source ? await workspaceDigests(await verifyWorkspaceSource(source)) : null; check();
        let current = await checkedCurrent(state.phase === 'active' ? null : state.sourceRevision);
        try {
          if (current.status.pendingCount) fail('WORKSPACE_SETUP_UNCONFIRMED');
          // The user can continue working between ceremony steps. Preserve
          // those changes as a new revision before producing the final backup.
          if (hashes && hashes.operationalDigest !== state.operationalDigest) {
            const manifest = await prepareBootstrapSource(source, storageOptions()); check();
            try {
              state = await persist(state, { ...state, backupRevision: null, pendingBackup: {
                operationId: newId(), expectedRevision: current.revision, sourceRevision: source.sourceRevision,
                operationalDigest: hashes.operationalDigest, bootstrap: serializeSource(manifest) } });
            } finally { manifest.bytes.fill(0); }
          }
        } finally { current.source.bytes.fill(0); }
        await reconcilePending();
        current = await checkedCurrent(state.phase === 'active' ? null : state.sourceRevision);
        const beforeBackup = { revision: current.revision, sourceRevision: current.source.sourceRevision };
        current.source.bytes.fill(0);
        const recovery = await createRecoveryPackage({ client: workspace, rootOperationId: state.rootOperationId,
          ownerRecovery: clone(state.ownerRecovery) });
        let released = false;
        try {
          check(); current = await checkedCurrent(beforeBackup.sourceRevision);
          try {
            if (current.revision !== beforeBackup.revision || current.status.pendingCount) fail('WORKSPACE_SETUP_CONFLICT');
            state = await persist(state, { ...state, phase: state.phase === 'active' ? 'active' : 'backup-ready',
              backupRevision: current.source.sourceRevision });
          } finally { current.source.bytes.fill(0); }
          released = true;
          return { phase: state.phase, packetBytes: recovery.packetBytes, recoveryCode: recovery.recoveryCode };
        } finally { if (!released) recovery.packetBytes?.fill(0); }
      } finally { source?.bytes.fill(0); }
    });
  }
  async function finish(backupSaved) {
    if (backupSaved !== true) fail('WORKSPACE_SETUP_BACKUP_REQUIRED');
    return runExclusive(async () => {
      let state = await read();
      if (state?.phase === 'active') return { ready: true, phase: 'active' };
      if (!state || state.phase !== 'backup-ready') fail('WORKSPACE_SETUP_NOT_READY');
      const source = await captureSource(); check();
      try {
        const hashes = await workspaceDigests(await verifyWorkspaceSource(source)); check();
        if (hashes.operationalDigest !== state.operationalDigest) return { ready: false, backupChanged: true };
        const workspace = await getClient(state), current = await workspace.readCurrent(); check();
        try {
          if (current.source.sourceRevision !== state.backupRevision || current.status.pendingCount || current.status.conflictCount)
            fail('WORKSPACE_SETUP_CONFLICT');
          // activate atomically persists the routing marker and mounts only an
          // independently admitted native runtime. This module grants nothing.
          await activate({ rootOperationId: state.rootOperationId, sourceRevision: current.source.sourceRevision }); check();
          state = await persist(state, { ...state, phase: 'active' });
          return { ready: true, phase: state.phase };
        } finally { current.source.bytes.fill(0); }
      } finally { source.bytes.fill(0); }
    });
  }
  return Object.freeze({ prepare: () => run(prepare), publish: consent => run(() => publish(consent)),
    backup: () => run(backup), finish: saved => run(() => finish(saved)),
    status: () => run(async () => { const state = await read(); return { phase: state?.phase || 'unprepared', ready: state?.phase === 'active' }; }),
    close() { closed = true; roots.close(); registrations.close(); owners.close(); enrollments.close(); client?.close(); } });
}
