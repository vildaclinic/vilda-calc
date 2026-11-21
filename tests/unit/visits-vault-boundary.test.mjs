import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyDurableVisitsDelta, restoreDurableVisitsBaseline } from '../../tools/visits-vault-delta.mjs';
import { reduceClinicalWorkspaceVault } from '../../tools/check_clinical_workspace_boundary.mjs';

const source = readFileSync(new URL('../../vilda_vault.js', import.meta.url), 'utf8');
const fragment = readFileSync(new URL('../../runtime/durable-visits-v1/vault-fragment.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../../runtime/durable-visits-v1/manifest.json', import.meta.url), 'utf8'));
const native = JSON.parse(readFileSync(new URL('../../runtime/clinical-workspace-v1/manifest.json', import.meta.url), 'utf8'));
const digest = value => createHash('sha256').update(value).digest('hex');

describe('durable visits preserve the exact native-workspace boundary proof', () => {
  it('reconstructs the deployed vault byte for byte from the pinned base and readable source', () => {
    const base = restoreDurableVisitsBaseline(source);
    expect(digest(base)).toBe('5318fe8f57be1ed3a7cb093cfa8affea151007195519e042a81b96dc754a8620');
    expect(digest(fragment)).toBe(manifest.fragmentSHA256);
    expect(source.includes(fragment)).toBe(true);
    expect(applyDurableVisitsDelta(base)).toBe(source);
    expect(restoreDurableVisitsBaseline(base)).toBe(base);
    expect(digest(reduceClinicalWorkspaceVault(source))).toBe(native.baseVaultSHA256);
    expect(digest(reduceClinicalWorkspaceVault(base))).toBe(native.baseVaultSHA256);
  });

  it('rejects unrelated input and output modifications', () => {
    expect(() => applyDurableVisitsDelta(restoreDurableVisitsBaseline(source) + '\n')).toThrow();
    expect(() => restoreDurableVisitsBaseline(source + '\n')).toThrow();
    expect(() => reduceClinicalWorkspaceVault(source + '\n')).toThrow();
  });

  it('rejects an altered or partially removed readable integration', () => {
    const start = '/* BEGIN VILDA DURABLE VISITS V1 */\n';
    expect(source.split(start)).toHaveLength(2);
    expect(() => reduceClinicalWorkspaceVault(source.replace(start, ''))).toThrow();
    expect(() => reduceClinicalWorkspaceVault(source.replace(start, start + '/* extra */\n'))).toThrow();
    expect(() => reduceClinicalWorkspaceVault(source.replace(fragment, ''))).toThrow();
  });

  it('rejects a change to each individual integration hook', () => {
    for (const hook of manifest.hooks) {
      const after = hook.after.replace('{{VILDA_DURABLE_VISITS_FRAGMENT}}', fragment);
      expect(source.split(after), hook.name).toHaveLength(2);
      expect(() => reduceClinicalWorkspaceVault(source.replace(after, () => after + '/* extra */')),
        hook.name).toThrow();
    }
  });
});
