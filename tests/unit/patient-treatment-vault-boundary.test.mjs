import { restoreVisitTrashBaseline } from '../../tools/visit-trash-vault-delta.mjs';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { applyPatientTreatmentDelta, restorePatientTreatmentBaseline } from '../../tools/patient-treatment-vault-delta.mjs';

const source = restoreVisitTrashBaseline(readFileSync(new URL('../../vilda_vault.js', import.meta.url), 'utf8'));
const manifest = JSON.parse(readFileSync(new URL('../../runtime/patient-treatment-v1/manifest.json', import.meta.url), 'utf8'));
const digest = value => createHash('sha256').update(value).digest('hex');
function nativePart(value) {
  const start = '/* BEGIN VILDA CLINICAL WORKSPACE NATIVE V1 */';
  const end = '/* END VILDA CLINICAL WORKSPACE NATIVE V1 */';
  return value.slice(value.indexOf(start), value.indexOf(end) + end.length);
}

describe('patient treatment exact vault source boundary', () => {
  it('rebuilds only its reviewed layer from the exact prior public vault', () => {
    const base = restorePatientTreatmentBaseline(source);
    expect(digest(base)).toBe(manifest.baseVaultSHA256);
    expect(applyPatientTreatmentDelta(base)).toBe(source);
    expect(digest(source)).toBe(manifest.integratedVaultSHA256);
    expect(nativePart(source)).toBe(nativePart(base));
    expect(restorePatientTreatmentBaseline(base)).toBe(base);
  });
  it('rejects unrelated image changes instead of blessing a new baseline', () => {
    expect(() => restorePatientTreatmentBaseline(source + '\n')).toThrow();
    expect(() => applyPatientTreatmentDelta(restorePatientTreatmentBaseline(source) + '\n')).toThrow();
  });
});
