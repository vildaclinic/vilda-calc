import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hashes = {
  'vilda_file_export.js': 'f1093dd96f418edb5b54ba7a59ad66b24c333ee8e9164b94d773a735ee219a53',
  'inline_ustawienia_04.js': '5d2761b2aa7dc96ce0ecc3aec88679ce765c152913fe0974f5d605811987d786'
};
const hash = value => createHash('sha256').update(value).digest('hex');
export function verifyClinicalWorkspaceBackup(repository = root) {
  const manifest = JSON.parse(readFileSync(resolve(repository, 'runtime/clinical-workspace-backup/manifest.json'), 'utf8'));
  if (manifest.namespace !== 'vilda-clinical-workspace-backup-boundary' || manifest.version !== 1 || manifest.files.length !== 2
    || new Set(manifest.files.map(entry => entry.path)).size !== 2) throw new Error('Backup manifest changed');
  for (const entry of manifest.files) {
    let source = readFileSync(resolve(repository, entry.path), 'utf8');
    if (hashes[entry.path] !== entry.baseSHA256 || hash(source) !== entry.integratedSHA256 || source.split(entry.inserted).length !== 2) throw new Error('Backup runtime changed');
    source = source.replace(entry.inserted, '');
    for (const patch of [...entry.patches].reverse()) {
      if (source.split(patch.after).length !== 2) throw new Error('Backup hook ambiguous');
      source = source.replace(patch.after, patch.before);
    }
    if (hash(source) !== entry.baseSHA256) throw new Error('Unrelated backup change');
  }
  return 2;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.stdout.write('Backup boundary: ' + verifyClinicalWorkspaceBackup() + ' exact deltas verified.\n');
