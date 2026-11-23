import{readFileSync}from'node:fs';
import{createHash}from'node:crypto';
import{describe,expect,it}from'vitest';
import{applyDocumentOutcomesDelta,restoreDocumentOutcomesBaseline}from'../../tools/document-outcomes-vault-delta.mjs';
import{restoreProfileTrashBaseline}from'../../tools/profile-trash-vault-delta.mjs';

const source=readFileSync(new URL('../../vilda_vault.js',import.meta.url),'utf8');
const manifest=JSON.parse(readFileSync(new URL('../../runtime/document-outcomes-v1/manifest.json',import.meta.url),'utf8'));
const hash=value=>createHash('sha256').update(value).digest('hex');
const native=value=>value.slice(value.indexOf('/* BEGIN VILDA CLINICAL WORKSPACE NATIVE V1 */'),value.indexOf('/* END VILDA CLINICAL WORKSPACE NATIVE V1 */'));
describe('strict compound outcome layer',()=>{
  it('exactly replays over the frozen independent profile/Trash fix',()=>{
    const base=restoreDocumentOutcomesBaseline(source);
    expect(hash(base)).toBe('16c39d32d496738528142158ac57ad87e933538c17d710a4be1e290ed4fe0325');
    expect(applyDocumentOutcomesDelta(base)).toBe(source);expect(hash(source)).toBe(manifest.integratedVaultSHA256);
    expect(native(source)).toBe(native(base));
    expect(restoreProfileTrashBaseline(source)).toBe(restoreProfileTrashBaseline(base));
  });
  it('rejects unrelated edits to either reviewed input or generated artifact',()=>{
    expect(()=>applyDocumentOutcomesDelta(restoreDocumentOutcomesBaseline(source)+'\n')).toThrow(/reviewed base/);
    expect(()=>restoreDocumentOutcomesBaseline(source+'\n')).toThrow(/integrated image/);
  });
});
