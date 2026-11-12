// Verify the bounded clinical dispatch delta and restore both pinned transports.
// This does not evaluate browser code, grant authority or bypass legacy guards.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Base images follow the latest transport change outside the clinical fragment: 2026-11-11, event-log drain with
// quarantine (P-SYNC-DRENAZ-ZDARZEN, E2-PR4c; before it P-SYNC-ZDARZENIA, E2-PR4b, and P-SYNC-LIMIT-ODCZYTU, E2-PR4a;
// docs/clinical/ALGORITHMS.md).
const bases = {
  'vilda_sync.js': { sha256: 'e11bec0f32efda7922280cddedbdb576a0e1f665d68e613ae118a57d81e6d598',
    names: ['TLibPullCycle', 'TLibPushCycle', 'TLibFullCycle', 'xt'] },
  'vilda_sync_integration.js': { sha256: '13dfa756259f4d3205c646ad94f27bc94823b278ced201b016a3965d942794ca',
    names: ['I', 'V', 'M', 'J', 'U', 'S', 'ot', 'K', 'G', 'PatientClinicalLegacyAllowed', 'ct', 'mt', 'j'] }
};
const digest = value => createHash('sha256').update(value).digest('hex');
function fail(message) { throw new Error('Clinical sync boundary: ' + message); }
export function verifyClinicalWorkspaceSync(repository = root) {
  const manifest = JSON.parse(readFileSync(resolve(repository, 'runtime/clinical-workspace-sync/manifest.json'), 'utf8'));
  if (manifest.namespace !== 'vilda-clinical-workspace-sync-runtime' || manifest.version !== 1
    || manifest.sourceRef !== 'a745299f6b75c4f2c408de83171d94aec6533f90' || !Array.isArray(manifest.files)
    || manifest.files.length !== 2 || new Set(manifest.files.map(entry => entry.path)).size !== 2) fail('unexpected manifest');
  for (const entry of manifest.files) {
    const base = bases[entry.path];
    if (!base || entry.baseSHA256 !== base.sha256 || typeof entry.inserted !== 'string' || !entry.inserted
      || !Array.isArray(entry.patches) || JSON.stringify(entry.patches.map(patch => patch.name)) !== JSON.stringify(base.names)) fail('unexpected patch definitions');
    let source = readFileSync(resolve(repository, entry.path), 'utf8');
    if (digest(source) !== entry.integratedSHA256 || source.split(entry.inserted).length !== 2) fail('changed generated transport or fragment');
    source = source.replace(entry.inserted, '');
    for (const patch of entry.patches) {
      if (typeof patch.before !== 'string' || typeof patch.after !== 'string' || !patch.before || !patch.after
        || source.split(patch.after).length !== 2) fail('ambiguous patch: ' + patch.name);
      source = source.replace(patch.after, patch.before);
    }
    if (digest(source) !== base.sha256) fail('unrelated transport change: ' + entry.path);
  }
  return manifest.files.length;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.stdout.write('Clinical sync: ' + verifyClinicalWorkspaceSync() + ' exact transport deltas verified.\n');
