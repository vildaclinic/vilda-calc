// Private native application coordinator. Callbacks are supplied by the vault
// closure, never accepted through UI input as account or storage authority.
import { createPatientClinicalWorkspaceRecoveryClient } from './index.mjs';
import { inspectPortableRecoveryHeader, MAX_PACKAGE_BYTES } from './package.mjs';
import { createPatientClinicalWorkspaceClient } from '../patient-clinical-workspace/index.mjs';
import { verifyWorkspaceSource } from '../patient-clinical-workspace-source/index.mjs';
import { bytesCopy } from '../patient-clinical-workspace-source/common.mjs';
import { fields, fail, inspectOrigin } from '../patient-clinical-workspace/common.mjs';
import { createWorkspaceConflictService } from '../patient-clinical-workspace-native/conflict-service.mjs';

function emptyValue(value) {
  if (value === null) return true;
  if (Array.isArray(value)) return value.length === 0;
  return value && typeof value === 'object' && Object.values(value).every(emptyValue);
}
function emptyPack(pack) {
  return pack.stores.every(store => store.records.length === 0) && pack.shadows.length === 0
    && Object.keys(pack.carePlansV2).length === 0 && pack.clinicalMeta.plaintext.length === 0
    && emptyValue(pack.clinicalMeta.value) && pack.legacyRecovery.stores.every(store => store.records.length === 0)
    && pack.legacyRecovery.shadows.length === 0 && emptyValue(pack.legacyRecovery.clinicalMeta.value);
}
function unavailable(message) { throw Object.assign(new Error(message), { code: 'WORKSPACE_RECOVERY_TARGET_NOT_EMPTY' }); }
const LEGACY_DIVERGED_MESSAGE = 'W starszej wersji aplikacji zapisano dodatkowe dane. Oba zapisy pozostają zachowane, ale pełna kopia nie obejmowałaby tych dodatkowych zmian. Eksport pełnej kopii jest wstrzymany do czasu ich osobnego uzgodnienia. Ten przypadek nie jest obsługiwany przez okno konfliktów synchronizacji.';
export function createNativeRecoveryProvider(input) {
  const options = fields(input, ['serviceOrigin', 'assertCurrent', 'withExclusive', 'readTarget', 'activate']);
  options.serviceOrigin = inspectOrigin(options.serviceOrigin);
  for (const key of ['assertCurrent', 'withExclusive', 'readTarget', 'activate']) if (typeof options[key] !== 'function') fail();
  let closed = false;
  const clients = new Set(), services = new Set(), drafts = new WeakMap(), retained = new Set();
  function check() { if (closed) fail('CLOSED'); options.assertCurrent(); }
  function close() {
    if (closed) return; closed = true;
    for (const service of services) service.close(); services.clear();
    for (const client of clients) client.close(); clients.clear();
    for (const draft of retained) { draft.packetBytes.fill(0); draft.recoveryCode = ''; }
    retained.clear();
  }
  async function target() {
    check(); const value = await options.readTarget(); check();
    if (!value || typeof value.accountId !== 'string' || typeof value.accountLabel !== 'string') fail('CORRUPT');
    try {
      const route = value.marker?.route || null;
      if (route) return { accountId: value.accountId, accountLabel: value.accountLabel, route,
        sourceRevision: null, empty: false, status: value.status || null };
      if (!value.source) fail('NOT_READY');
      const pack = await verifyWorkspaceSource(value.source); check();
      return { accountId: value.accountId, accountLabel: value.accountLabel, route: null,
        sourceRevision: value.source.sourceRevision, empty: value.marker === null && emptyPack(pack), status: null };
    } finally { value.source?.bytes?.fill(0); }
  }
  function requireEmpty(value) {
    if (!value.empty || value.route) unavailable('Odtwarzanie wymaga pustego konta. Bieżące dane i rozpoczęte plany pozostają zachowane. Wybierz lub utwórz puste konto.');
  }
  function requireExportable(value) {
    if (!value.route || !value.status) fail('NOT_READY');
    if (value.status.legacyDiverged) throw Object.assign(new Error(LEGACY_DIVERGED_MESSAGE), { code: 'WORKSPACE_RECOVERY_LEGACY_DIVERGED' });
  }
  function recovery(rootOperationId) {
    const value = createPatientClinicalWorkspaceRecoveryClient({ serviceOrigin: options.serviceOrigin, rootOperationId });
    clients.add(value); return value;
  }
  async function exclusive(action) { check(); return options.withExclusive(async () => { check(); const result = await action(); check(); return result; }); }
  return Object.freeze({
    async getState() {
      return exclusive(async () => {
        const value = await target();
        return Object.freeze({ accountLabel: value.accountLabel, canExport: !!value.route && !!value.status && !value.status.legacyDiverged,
          canImport: value.empty, pendingCount: value.status?.pendingCount || 0,
          message: value.status?.legacyDiverged ? LEGACY_DIVERGED_MESSAGE
            : value.route && !value.status ? 'Nie można potwierdzić spójności obu zapisów danych. Eksport pełnej kopii jest wstrzymany.'
            : value.route ? 'Kopia obejmuje dokumentację pacjentów i zachowane zmiany oczekujące na synchronizację.'
            : value.empty ? 'Możesz odtworzyć pełną kopię na tym pustym koncie.'
              : 'Odtwarzanie wymaga pustego konta. Nie zastąpi danych bieżącego konta.' });
      });
    },
    async exportBackup() {
      return exclusive(async () => {
        const value = await target(); requireExportable(value);
        const client = recovery(value.route.rootOperationId);
        try {
          const result = await client.createRecoveryPackage();
          try {
            check(); const after = await target(); requireExportable(after);
            if (after.accountId !== value.accountId || after.route.rootOperationId !== value.route.rootOperationId) fail('CONFLICT');
            return result;
          } catch (error) { result.packetBytes.fill(0); throw error; }
        } finally { client.close(); clients.delete(client); }
      });
    },
    async previewImport(input) {
      const args = fields(input, ['packetBytes', 'recoveryCode']);
      if (typeof args.recoveryCode !== 'string') fail();
      const packetBytes = bytesCopy(args.packetBytes, MAX_PACKAGE_BYTES); let released = false;
      try {
        return await exclusive(async () => {
          const before = await target(); requireEmpty(before);
          const header = inspectPortableRecoveryHeader(packetBytes);
          if (header.serviceOrigin !== options.serviceOrigin) fail('CONFLICT');
          const client = recovery(header.rootOperationId);
          try {
            const preview = await client.previewRecoveryPackage({ packetBytes, recoveryCode: args.recoveryCode }); check();
            const after = await target(); requireEmpty(after);
            if (before.accountId !== after.accountId || before.sourceRevision !== after.sourceRevision) fail('CONFLICT');
            const token = Object.freeze({}), draft = { packetBytes, recoveryCode: args.recoveryCode,
              accountId: after.accountId, sourceRevision: after.sourceRevision, preview };
            drafts.set(token, draft); retained.add(draft); released = true;
            return Object.freeze({ token, accountLabel: after.accountLabel, patientCount: preview.patientCount,
              carePlanCount: preview.carePlanCount, pendingCount: preview.pendingCount,
              conflictCount: preview.conflictCount, packageVerified: true, writeAvailable: false });
          } finally { client.close(); clients.delete(client); }
        });
      } finally { if (!released) packetBytes.fill(0); }
    },
    async importBackup(input) {
      const args = fields(input, ['token']), draft = drafts.get(args.token);
      if (!draft) fail('INVALID');
      return exclusive(async () => {
        const before = await target(); requireEmpty(before);
        if (before.accountId !== draft.accountId || before.sourceRevision !== draft.sourceRevision) fail('CONFLICT');
        const client = recovery(draft.preview.rootOperationId);
        const workspace = createPatientClinicalWorkspaceClient({ serviceOrigin: options.serviceOrigin, rootOperationId: draft.preview.rootOperationId });
        clients.add(workspace);
        try {
          await client.importRecoveryPackage({ packetBytes: draft.packetBytes, recoveryCode: draft.recoveryCode }); check();
          await workspace.open(); check();
          const status = await workspace.flush(); check();
          if (status.conflictCount) {
            draft.conflicted = true;
            throw Object.assign(new Error('Odzyskane zmiany wymagają przeglądu konfliktu. Obie wersje zachowano; bieżące konto nie zostało przełączone.'), { code: 'WORKSPACE_RECOVERY_CONFLICT' });
          }
          if (!status.localWriteAvailable || status.bootstrapRequired) fail('NOT_READY');
          const current = await workspace.readCurrent(); check();
          try {
            const pack = await verifyWorkspaceSource(current.source); check();
            if (pack.accountBinding !== draft.preview.sourceAccountBinding) fail('CONFLICT');
            const after = await target(); requireEmpty(after);
            if (after.accountId !== draft.accountId || after.sourceRevision !== draft.sourceRevision) fail('CONFLICT');
            await options.activate({ rootOperationId: draft.preview.rootOperationId,
              accountBinding: pack.accountBinding, sourceRevision: current.source.sourceRevision }); check();
          } finally { current.source.bytes.fill(0); }
          drafts.delete(args.token); retained.delete(draft); draft.packetBytes.fill(0); draft.recoveryCode = '';
          return Object.freeze({ restored: true });
        } finally { client.close(); clients.delete(client); workspace.close(); clients.delete(workspace); }
      });
    },
    getConflictService(input) {
      check(); const args = fields(input, ['token']), draft = drafts.get(args.token);
      if (!draft?.conflicted) fail('NOT_READY');
      const workspace = createPatientClinicalWorkspaceClient({ serviceOrigin: options.serviceOrigin,
        rootOperationId: draft.preview.rootOperationId });
      clients.add(workspace); let opened = false, disposed = false;
      function valid() { check(); if (disposed || drafts.get(args.token) !== draft) fail('CLOSED'); }
      const service = createWorkspaceConflictService({
        assertCurrent: valid, accountBinding: draft.preview.sourceAccountBinding,
        newId: () => 'recovery-resolution-' + crypto.randomUUID(), codec: { verifyWorkspaceSource },
        runExclusive: action => exclusive(async () => {
          valid(); const value = await target(); requireEmpty(value);
          if (value.accountId !== draft.accountId || value.sourceRevision !== draft.sourceRevision) fail('CONFLICT');
          if (!opened) { await workspace.open(); valid(); opened = true; }
          const result = await action(workspace); valid(); return result;
        })
      });
      const wrapper = Object.freeze({ review: () => service.review(), resolve: input => service.resolve(input),
        close() { if (disposed) return; disposed = true; service.close(); workspace.close(); clients.delete(workspace); services.delete(wrapper); } });
      services.add(wrapper); return wrapper;
    },
    discardPreview(token) {
      const draft = drafts.get(token); if (!draft) return;
      drafts.delete(token); retained.delete(draft); draft.packetBytes.fill(0); draft.recoveryCode = '';
    },
    close
  });
}
