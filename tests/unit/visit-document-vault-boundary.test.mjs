import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { applyVisitDocumentDelta, restoreVisitDocumentBaseline } from '../../tools/visit-document-vault-delta.mjs';
import { restorePatientProfileBaseline } from '../../tools/patient-profile-vault-delta.mjs';
import { restoreProfileTrashBaseline } from '../../tools/profile-trash-vault-delta.mjs';

const source = restoreProfileTrashBaseline(readFileSync(new URL('../../vilda_vault.js', import.meta.url), 'utf8'));
const manifest = JSON.parse(readFileSync(new URL('../../runtime/visit-document-v1/manifest.json', import.meta.url), 'utf8'));
const digest = value => createHash('sha256').update(value).digest('hex');
function native(source) {
  const first = '/* BEGIN VILDA CLINICAL WORKSPACE NATIVE V1 */\n', last = '/* END VILDA CLINICAL WORKSPACE NATIVE V1 */\n';
  return source.slice(source.indexOf(first), source.indexOf(last) + last.length);
}

describe('exact active-visit document guard layer', () => {
  it('replays the declared narrow guard over the reviewed patient-profile image', () => {
    const base = restoreVisitDocumentBaseline(source);
    expect(digest(base)).toBe('0499a9e445e5463d3a694cf5675684d333bbd4dd2b01a956a56ee918245869cd');
    expect(applyVisitDocumentDelta(base)).toBe(source);
    expect(digest(source)).toBe(manifest.integratedVaultSHA256);
  });
  it('preserves the entire native block and still composes with the independent profile proof', () => {
    const base = restoreVisitDocumentBaseline(source);
    expect(native(source)).toBe(native(base));
    expect(restorePatientProfileBaseline(source)).toBe(restorePatientProfileBaseline(base));
  });
  it('rejects unreviewed edits instead of treating them as part of the guard', () => {
    expect(() => restoreVisitDocumentBaseline(source + '\n/* unrelated */')).toThrow(/unexpected integrated image/);
    expect(() => applyVisitDocumentDelta(restoreVisitDocumentBaseline(source) + '\n')).toThrow(/unexpected reviewed base/);
  });
});
