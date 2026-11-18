// Refresh public-base metadata only after all reproducible Vault deltas pass.
// The protected native fragment, historical base and module bytes do not change.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveClinicalWorkspacePublicBase, verifyClinicalWorkspaceCurrentBase } from './check_clinical_workspace_boundary.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function refreshClinicalWorkspaceBase(repository = ROOT) {
  const source = readFileSync(resolve(repository, 'vilda_vault.js'), 'utf8');
  const derived = deriveClinicalWorkspacePublicBase(source, repository);
  const path = resolve(repository, 'runtime/clinical-workspace-v1/manifest.json');
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  manifest.nativeIntegrationBaseVaultSHA256 = derived.nativeIntegrationBaseVaultSHA256;
  manifest.baseVaultSHA256 = derived.baseVaultSHA256;
  manifest.publicVaultSHA256 = derived.publicVaultSHA256;
  writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
  verifyClinicalWorkspaceCurrentBase(source, repository);
  return derived;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.length && args[0] !== '--write') throw Error('Usage: node tools/update-clinical-workspace-base.mjs [--write]');
  const result = args.length ? refreshClinicalWorkspaceBase()
    : verifyClinicalWorkspaceCurrentBase(readFileSync(resolve(ROOT, 'vilda_vault.js'), 'utf8'));
  process.stdout.write('Current public Vault base: ' + result.baseVaultSHA256 + '; historical native proof retained.\n');
}
