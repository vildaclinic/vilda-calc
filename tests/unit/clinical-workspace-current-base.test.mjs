import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { restorePatientProfileBaseline } from '../../tools/patient-profile-vault-delta.mjs';
import { applyRapidVisitDelta, restoreRapidVisitBaseline } from '../../tools/rapid-visit-vault-delta.mjs';
import { deriveClinicalWorkspacePublicBase, verifyClinicalWorkspaceCurrentBase } from '../../tools/check_clinical_workspace_boundary.mjs';

const root = new URL('../../', import.meta.url);
const source = readFileSync(new URL('vilda_vault.js', root), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('runtime/clinical-workspace-v1/manifest.json', root), 'utf8'));
const digest = value => createHash('sha256').update(value).digest('hex');
let temporary;
afterEach(() => { if (temporary) rmSync(temporary, { recursive: true, force: true }); temporary = null; });
function withManifest(change) {
  temporary = mkdtempSync(join(tmpdir(), 'vilda-current-base-'));
  for (const name of [
    'patient-treatment-v1', 'durable-visits-v1', 'visit-trash-v1', 'rapid-visit-v1',
    'patient-profile-v1', 'visit-document-v1', 'profile-trash-v1', 'document-outcomes-v1',
    'treatment-documentation-v1', 'staged-documentation-v1',
  ]) {
    cpSync(new URL('runtime/' + name, root), join(temporary, 'runtime', name), { recursive: true });
  }
  const directory = join(temporary, 'runtime', 'clinical-workspace-v1'); mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'manifest.json'), JSON.stringify({ ...manifest, ...change }));
  return temporary;
}
describe('current public Vault base for the next private workspace build', () => {
  it('replays rapid intake on the exact published whole-visit trash image', () => {
    const prior = restoreRapidVisitBaseline(source);
    expect(digest(prior)).toBe('1cc227c5b2e0daed415b9f26fa94fdb44aa94935c21783f25e4cf33fb1d775e2');
    expect(applyRapidVisitDelta(prior)).toBe(restorePatientProfileBaseline(source));
    expect(() => restoreRapidVisitBaseline(source.replace('function RapidVisitDatabase(', 'function ChangedRapidVisitDatabase('))).toThrow();
  });
  it('keeps all public deltas while removing only the exact native fragment and its hooks', () => {
    const result = verifyClinicalWorkspaceCurrentBase(source);
    expect(digest(result.baseSource)).toBe(manifest.baseVaultSHA256);
    expect(result.publicVaultSHA256).toBe(digest(source));
    expect(result.nativeIntegrationBaseVaultSHA256).toBe('06ea023197d3e70fc30e965d5b2b57744fbbcbc0f638f5baa798e5ce3e209031');
    expect(result.baseSource).toContain('/* BEGIN VILDA PATIENT TREATMENT V1 */');
    expect(result.baseSource).toContain('/* BEGIN VILDA DURABLE VISITS V1 */');
    expect(result.baseSource).toContain('/* BEGIN VILDA WHOLE VISIT TRASH V1 */');
    expect(result.baseSource).toContain('/* BEGIN VILDA RAPID VISIT COMMIT V1 */');
    expect(result.baseSource).toContain('/* BEGIN VILDA PATIENT PROFILE V1 */');
    expect(result.baseSource).toContain('/* BEGIN VILDA VISIT DOCUMENT V1 */');
    expect(result.baseSource).toContain('/* BEGIN VILDA PROFILE TRASH V1 */');
    expect(result.baseSource).toContain('/* BEGIN VILDA DOCUMENT OUTCOMES V1 */');
    expect(result.baseSource).toContain('/* BEGIN VILDA TREATMENT DOCUMENTATION V1 */');
    expect(result.baseSource).toContain('/* BEGIN VILDA STAGED DOCUMENTATION V1 */');
    expect(result.baseSource).not.toContain('/* BEGIN VILDA CLINICAL WORKSPACE NATIVE V1 */');
  });
  it('rejects a stale current base even when the historical native proof still matches', () => {
    expect(() => verifyClinicalWorkspaceCurrentBase(source, withManifest({ baseVaultSHA256: manifest.nativeIntegrationBaseVaultSHA256 }))).toThrow(/current public base metadata/);
  });
  it('rejects a stale public artifact hash', () => {
    expect(() => verifyClinicalWorkspaceCurrentBase(source, withManifest({ publicVaultSHA256: '0'.repeat(64) }))).toThrow(/current public base metadata/);
  });
  it('rejects an unapproved public edit and a protected-fragment edit before deriving a new base', () => {
    expect(() => deriveClinicalWorkspacePublicBase(source + '\n')).toThrow();
    expect(() => deriveClinicalWorkspacePublicBase(source.replace('/* BEGIN VILDA CLINICAL WORKSPACE NATIVE V1 */', '/* CHANGED VILDA CLINICAL WORKSPACE NATIVE V1 */'))).toThrow();
  });
});
