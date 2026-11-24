import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { applyDiagnosisMutationDelta, restoreDiagnosisMutationBaseline } from '../../tools/diagnosis-mutation-vault-delta.mjs';

const read = file => readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
const integrated = read('vilda_vault.js');
const manifest = JSON.parse(read('runtime/diagnosis-mutation-v1/manifest.json'));
const hash = value => createHash('sha256').update(value).digest('hex');
const native = value => value.slice(value.indexOf('/* BEGIN VILDA CLINICAL WORKSPACE NATIVE V1 */'),
  value.indexOf('/* END VILDA CLINICAL WORKSPACE NATIVE V1 */') + '/* END VILDA CLINICAL WORKSPACE NATIVE V1 */'.length);

describe('diagnosis mutation exact outer Vault layer', () => {
  it('replays over the exact reviewed image without changing the sealed native block', () => {
    const base = restoreDiagnosisMutationBaseline(integrated);
    expect(hash(integrated)).toBe(manifest.integratedVaultSHA256);
    expect(hash(base)).toBe(manifest.baseVaultSHA256);
    expect(base).not.toContain('/* BEGIN VILDA DIAGNOSIS MUTATION V1 */');
    expect(applyDiagnosisMutationDelta(base)).toBe(integrated);
    expect(native(base)).toBe(native(integrated));
    expect(restoreDiagnosisMutationBaseline(base)).toBe(base);
  });
  it('rejects an unrelated image change instead of blessing a new baseline', () => {
    const base = restoreDiagnosisMutationBaseline(integrated);
    expect(() => restoreDiagnosisMutationBaseline(integrated + '\n')).toThrow(/integrated image/);
    expect(() => applyDiagnosisMutationDelta(base + '\n')).toThrow(/reviewed base/);
  });
  it('carries its readable source verbatim inside the image', () => {
    const fragment = read(manifest.source);
    expect(hash(fragment)).toBe(manifest.sourceSHA256);
    expect(integrated).toContain('/* BEGIN VILDA DIAGNOSIS MUTATION V1 */\n' + fragment + '/* END VILDA DIAGNOSIS MUTATION V1 */\n');
    expect(new Set(manifest.hooks.map(hook => hook.name)).size).toBe(manifest.hooks.length);
  });
});
