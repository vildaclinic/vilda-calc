import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { applyPatientProfileDelta, restorePatientProfileBaseline } from '../../tools/patient-profile-vault-delta.mjs';
import { restoreVisitDocumentBaseline } from '../../tools/visit-document-vault-delta.mjs';

const source = restoreVisitDocumentBaseline(readFileSync(new URL('../../vilda_vault.js', import.meta.url), 'utf8'));
const manifest = JSON.parse(readFileSync(new URL('../../runtime/patient-profile-v1/manifest.json', import.meta.url), 'utf8'));
const digest = text => createHash('sha256').update(text).digest('hex');
function nativeFragment(text) {
  const start = '/* BEGIN VILDA CLINICAL WORKSPACE NATIVE V1 */\n';
  const end = '/* END VILDA CLINICAL WORKSPACE NATIVE V1 */\n';
  return text.slice(text.indexOf(start), text.indexOf(end) + end.length);
}

describe('strict patient profile outer Vault layer', () => {
  it('rebuilds byte-for-byte from the exact reviewed rapid-visit image', () => {
    const base = restorePatientProfileBaseline(source);
    expect(digest(base)).toBe('053273d4f0b8e0e7a1519178d6ab177dc4d1824b34cf172fbeb85e6ff8f5f622');
    expect(applyPatientProfileDelta(base)).toBe(source);
    expect(digest(source)).toBe(manifest.integratedVaultSHA256);
  });
  it('keeps the complete protected native workspace fragment unchanged', () => {
    expect(nativeFragment(source)).toBe(nativeFragment(restorePatientProfileBaseline(source)));
  });
  it('rejects unrelated writes instead of stripping arbitrary additions', () => {
    expect(() => restorePatientProfileBaseline(source + '\n/* unrelated mutation */')).toThrow(/unexpected integrated image/);
    expect(() => applyPatientProfileDelta(restorePatientProfileBaseline(source) + '\n')).toThrow(/unexpected reviewed base/);
  });
});
