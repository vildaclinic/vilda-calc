import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { restoreKtvVaultBaseline } from '../../tools/klirens-ktv-vault-delta.mjs';
import { reduceClinicalWorkspaceVault } from '../../tools/check_clinical_workspace_boundary.mjs';

const source = readFileSync(new URL('../../vilda_vault.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../../runtime/clinical-workspace-v1/manifest.json', import.meta.url), 'utf8'));
const digest = value => createHash('sha256').update(value).digest('hex');
const checked = restoreKtvVaultBaseline(source);

describe('reviewed signed URR compatibility preserves native integrity proof', () => {
  it('restores the exact published image and the pinned non-workspace base', () => {
    expect(digest(checked)).toBe(manifest.integratedVaultSHA256);
    expect(digest(reduceClinicalWorkspaceVault(source))).toBe(manifest.baseVaultSHA256);
  });
  it('leaves the exact native artifact without the optional URR delta unchanged', () => {
    expect(restoreKtvVaultBaseline(checked)).toBe(checked);
    expect(digest(reduceClinicalWorkspaceVault(checked))).toBe(manifest.baseVaultSHA256);
  });
  for (const [label, original, replacement] of [
    ['unit', 'const signedUrr = test === "URR — wskaźnik redukcji mocznika" && unit === "%"', 'const signedUrr = test === "URR — wskaźnik redukcji mocznika" && unit === "mg/L"'],
    ['test name', 'const signedUrr = test === "URR — wskaźnik redukcji mocznika"', 'const signedUrr = test === "Other test"'],
    ['canonical identity', 'testKey === "urrwskaznikredukcjimocznika"', 'testKey === "different"'],
    ['signed exception condition', 't.valueNum >= 0 || signedSerumGap || signedUrr', 't.valueNum >= 0 || signedSerumGap || true'],
  ]) {
    it('rejects an altered reviewed ' + label, () => {
      expect(source.includes(original)).toBe(true);
      expect(() => reduceClinicalWorkspaceVault(source.replace(original, replacement))).toThrow();
    });
  }
  it('rejects any additional bytes outside the approved sanitizer', () => {
    expect(() => reduceClinicalWorkspaceVault(source + '\n')).toThrow();
    const anchor = 'function kt(t) {';
    expect(source.includes(anchor)).toBe(true);
    expect(() => reduceClinicalWorkspaceVault(source.replace(anchor, anchor + '/* unexpected */'))).toThrow();
  });
  it('still rejects a native fragment change', () => {
    const anchor = '/* BEGIN VILDA CLINICAL WORKSPACE NATIVE V1 */\n';
    expect(() => reduceClinicalWorkspaceVault(source.replace(anchor, anchor + '/* unexpected */\n'))).toThrow();
  });
});
