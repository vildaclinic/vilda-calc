import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { applyStagedDocumentationDelta, restoreStagedDocumentationBaseline } from '../../tools/staged-documentation-vault-delta.mjs';

const source = file => readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
const fragment = source('runtime/staged-documentation-v1/vault-fragment.js');
const origin = { version: 1, visitId: 'visit-a', clinicalDateISO: '2026-11-20' };
const document = { id: 'doc-a', patientId: 'patient-a', clinicalDateISO: '2026-11-12' };
const create = { action: 'createDocument', expectedRevision: null, document };
const projection = { action: 'projectReminder', id: 'reminder-a' };
const plan = { record: { patientId: 'patient-a' } };

async function protectedService() {
  const bindings = new Map([['in-visit', { patientId: document.patientId, binding: { visitContext: origin } }]]);
  const native = { createCarePlanService: ({ workspace }) => workspace };
  const canonical = vi.fn(async (note, options, current) => {
    current(); expect(note).toEqual({ patientId: document.patientId, visitContext: origin });
    expect(options.requireActiveVisit).toBe(true);
  });
  const scope = {
    PatientWorkspaceModules: async () => native,
    EncounterPlanBindings: bindings,
    EncounterPlanOperation: (id, patientId) => {
      if (bindings.get(id)?.patientId !== patientId) throw new Error('Patient changed');
      return origin;
    },
    VisitDocumentCheckActive: canonical,
  };
  const factories = await runInNewContext(fragment + '\nStagedDocumentInstall(); PatientWorkspaceModules();', scope);
  const committed = [];
  const workspace = factories.createCarePlanService({ workspace: {
    async transact(id, action) {
      const candidate = [];
      const result = await action({
        applyDocumentEffect: value => candidate.push(value),
        setPlan: () => { candidate.push(plan); },
      });
      committed.push(...candidate);
      return result;
    },
  } });
  return { workspace, committed, canonical };
}

describe('staged visit document effects', () => {
  it('adds the opening visit to a new document only and keeps the synchronous native setPlan contract', async () => {
    const { workspace, committed, canonical } = await protectedService();
    await workspace.transact('in-visit', async tx => {
      await tx.applyDocumentEffect(create);
      await tx.applyDocumentEffect(projection);
      expect(tx.setPlan('plan-a', plan)).toBeUndefined();
    });
    expect(committed).toEqual([{ ...create, document: { ...document, visitContext: origin } }, projection, plan]);
    expect(canonical).toHaveBeenCalledTimes(1);
  });
  it('rolls back the entire protected stage when its visit no longer exists and preserves general work and receipts', async () => {
    const { workspace, committed, canonical } = await protectedService();
    canonical.mockRejectedValueOnce(new Error('Visit removed'));
    await expect(workspace.transact('in-visit', async tx => {
      await tx.applyDocumentEffect(create);
      tx.setPlan('plan-a', plan);
    })).rejects.toThrow('Visit removed');
    expect(committed).toEqual([]);
    await expect(workspace.transact('in-visit', () => 'known receipt')).resolves.toBe('known receipt');
    await workspace.transact('general', async tx => { await tx.applyDocumentEffect(create); tx.setPlan('plan-a', plan); });
    expect(committed).toEqual([create, plan]);
    expect(canonical).toHaveBeenCalledTimes(1);
  });
  it('restores the exact predecessor and rejects changes outside the declared factory layer', () => {
    const vault = source('vilda_vault.js'), base = restoreStagedDocumentationBaseline(vault);
    expect(applyStagedDocumentationDelta(base)).toBe(vault);
    expect(() => restoreStagedDocumentationBaseline(vault + '\n')).toThrow(/integrated image/);
  });
});
