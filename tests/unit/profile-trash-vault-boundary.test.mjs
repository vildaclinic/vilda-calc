import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyProfileTrashDelta, restoreProfileTrashBaseline } from '../../tools/profile-trash-vault-delta.mjs';
import { restoreVisitDocumentBaseline } from '../../tools/visit-document-vault-delta.mjs';
import { restoreDocumentOutcomesBaseline } from '../../tools/document-outcomes-vault-delta.mjs';
const source=restoreDocumentOutcomesBaseline(readFileSync(new URL('../../vilda_vault.js',import.meta.url),'utf8'));
const manifest=JSON.parse(readFileSync(new URL('../../runtime/profile-trash-v1/manifest.json',import.meta.url),'utf8'));
const hash=value=>createHash('sha256').update(value).digest('hex');
const native=value=>value.slice(value.indexOf('/* BEGIN VILDA CLINICAL WORKSPACE NATIVE V1 */'),
  value.indexOf('/* END VILDA CLINICAL WORKSPACE NATIVE V1 */')+'/* END VILDA CLINICAL WORKSPACE NATIVE V1 */'.length);
describe('atomic profile retention outer Vault proof',()=>{
  it('replays over the exact reviewed document layer and restores its complete image',()=>{
    const base=restoreProfileTrashBaseline(source);
    expect(hash(base)).toBe('8c258ae2118257af1929817b7b6c1c1a24f4b3325ad48c11ea022914eb3ed8ed');
    expect(applyProfileTrashDelta(base)).toBe(source); expect(hash(source)).toBe(manifest.integratedVaultSHA256);
    expect(manifest.sources).toHaveLength(2); expect(manifest.hooks).toHaveLength(10);
  });
  it('keeps the protected native block byte-identical and composes with the older document proof',()=>{
    const base=restoreProfileTrashBaseline(source);
    expect(native(source)).toBe(native(base)); expect(native(source)).not.toBe('');
    expect(restoreVisitDocumentBaseline(source)).toBe(restoreVisitDocumentBaseline(base));
  });
  it('rejects changed outer source, unrelated mutations and unexpected baselines',()=>{
    expect(()=>restoreProfileTrashBaseline(source+'\n// unrelated')).toThrow(/unexpected integrated image/);
    expect(()=>applyProfileTrashDelta(restoreProfileTrashBaseline(source)+'\n')).toThrow(/unexpected reviewed base/);
  });
});
