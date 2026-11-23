import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyTreatmentDocumentationDelta, restoreTreatmentDocumentationBaseline } from '../../tools/treatment-documentation-vault-delta.mjs';
import { restoreDocumentOutcomesBaseline } from '../../tools/document-outcomes-vault-delta.mjs';
const source=readFileSync(new URL('../../vilda_vault.js',import.meta.url),'utf8');
const manifest=JSON.parse(readFileSync(new URL('../../runtime/treatment-documentation-v1/manifest.json',import.meta.url),'utf8'));
const hash=value=>createHash('sha256').update(value).digest('hex');
const native=value=>value.slice(value.indexOf('/* BEGIN VILDA CLINICAL WORKSPACE NATIVE V1 */'),
  value.indexOf('/* END VILDA CLINICAL WORKSPACE NATIVE V1 */')+'/* END VILDA CLINICAL WORKSPACE NATIVE V1 */'.length);
describe('strict treatment-document durability outer layer',()=>{
  it('replays over the exact frozen outcome image and preserves the protected native source',()=>{
    const base=restoreTreatmentDocumentationBaseline(source);
    expect(hash(base)).toBe('294774d6ee7fdb494e238b68c9bd81d74eb61aefb348acb71cc69ab6b241870c');
    expect(applyTreatmentDocumentationDelta(base)).toBe(source); expect(hash(source)).toBe(manifest.integratedVaultSHA256);
    expect(native(source)).toBe(native(base)); expect(native(source)).not.toBe('');
    expect(restoreDocumentOutcomesBaseline(source)).toBe(restoreDocumentOutcomesBaseline(base));
  });
  it('rejects a changed input and any unrelated generated-artifact mutation',()=>{
    expect(()=>applyTreatmentDocumentationDelta(restoreTreatmentDocumentationBaseline(source)+'\n')).toThrow(/reviewed base/);
    expect(()=>restoreTreatmentDocumentationBaseline(source+'\n')).toThrow(/integrated image/);
  });
});
