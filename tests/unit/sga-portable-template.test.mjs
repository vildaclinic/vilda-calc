import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const modelSource = readFileSync(new URL('../../vilda_care_template_model.js', import.meta.url), 'utf8');
const transferSource = readFileSync(new URL('../../vilda_care_template_transfer.js', import.meta.url), 'utf8');
const at = { recordedAtISO: '2026-11-09T12:00:00.000Z' };
function api() {
  const forbidden = vi.fn(() => { throw new Error('Unexpected side effect'); });
  const window = { crypto: { subtle: webcrypto.subtle, getRandomValues: forbidden }, URL, fetch: forbidden,
    localStorage: { getItem: forbidden, setItem: forbidden }, indexedDB: { open: forbidden },
    document: new Proxy({}, { get: forbidden }), setTimeout: forbidden };
  const context = vm.createContext({ window, URL, Date: new Proxy(Date, { construct: forbidden, get: forbidden }), Math: { random: forbidden } });
  vm.runInContext(modelSource, context); vm.runInContext(transferSource, context);
  return { model: window.VildaCareTemplateModel, transfer: window.VildaCareTemplateTransfer, window, forbidden };
}
const file = readFileSync(new URL('../../templates/sga/SGA-kwalifikacja-Maciej-Flader.vilda-template.json', import.meta.url), 'utf8');

describe('owner-approved SGA 1.0 portable template', () => {
  it('imports the released file through the production codec and preserves rights on re-export', async () => {
    const { transfer, model, forbidden } = api();
    const parsed = await transfer.parse(file);
    expect(parsed.ok).toBe(true);
    expect(parsed.contentDigest).toBe('6b192db0878e87d336366b15fa5f98b7ee19d242a598bae9fc1ac5894fc0e60f');
    const original = parsed.definition;
    expect(original.publication.authors).toEqual(['Maciej Flader']);
    expect(original.publication.version).toBe('1.0');
    expect(original.publication.license.id).toBe('custom');
    expect(original.stages).toHaveLength(3);
    expect(original.steps).toHaveLength(10);
    for (const step of original.steps) {
      expect(step.requiredOutcome).toBe('decision');
      expect(step.reminderRule.kind).toBe('none');
    }
    const maps = {
      stageIds: Object.fromEntries(original.stages.map((s, i) => [s.id, 'fictional-sga-stage-' + i])),
      stepIds: Object.fromEntries(original.steps.map((s, i) => [s.id, 'fictional-sga-step-' + i]))
    };
    const imported = await transfer.prepareImport(original, maps);
    expect(imported.ok).toBe(true);
    expect(model.validateDefinition(imported.definition).valid).toBe(true);
    expect(imported.definition.publication.license).toEqual(original.publication.license);
    expect(imported.definition.publication.sources).toEqual(original.publication.sources);
    const saved = await model.prepareTemplateOperation(null, {
      templateId: 'fictional-sga-template', operationId: 'fictional-sga-create',
      baseToken: null, action: 'save', definition: imported.definition
    }, at);
    expect(saved.ok).toBe(true);
    const exported = await transfer.serialize(saved.event.revision.definition);
    expect(exported.ok).toBe(true);
    const received = await transfer.parse(exported.text);
    expect(received.ok).toBe(true);
    expect(received.definition.publication.license).toEqual(original.publication.license);
    expect(received.definition.publication.origin.contentDigest).toBe(parsed.contentDigest);
    expect(forbidden).not.toHaveBeenCalled();
  });
});
