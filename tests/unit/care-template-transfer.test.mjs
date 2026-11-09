import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const modelSource = readFileSync(new URL('../../vilda_care_template_model.js', import.meta.url), 'utf8');
const transferSource = readFileSync(new URL('../../vilda_care_template_transfer.js', import.meta.url), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
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
function definition() {
  return { contentVersion: 2, name: 'Fikcyjny szablon do przekazania', purpose: 'Fikcyjne instrukcje organizacyjne.', labels: ['Fikcyjny'],
    publication: { id: 'fictional-shared-publication', version: '1.0', authors: ['Fikcyjny autor pierwotny'], contributors: [],
      sources: [{ title: 'Fikcyjne źródło', url: 'https://example.org/fikcyjne-zrodlo', version: '2026' }],
      license: { id: 'custom', url: '', text: 'Fikcyjne warunki: udostępnianie i modyfikacja z zachowaniem podpisu.',
        allowRedistribution: true, allowAdaptation: true }, attribution: 'Fikcyjna informacja o autorstwie.', changes: '', origin: null },
    stageOrder: ['original-stage-b', 'original-stage-a'],
    stages: [{ id: 'original-stage-a', title: 'Drugi fikcyjny etap', stepIds: ['original-step-a'] },
      { id: 'original-stage-b', title: 'Pierwszy fikcyjny etap', stepIds: ['original-step-b', 'original-step-c'] }],
    steps: [
      { id: 'original-step-a', stageId: 'original-stage-a', title: 'Fikcyjne sprawdzenie kompletu', taskKind: 'documentation',
        instruction: 'Sprawdź komplet fikcyjnych wyników.', requiredOutcome: 'decision', reminderRule: { kind: 'none' }, includedByDefault: true },
      { id: 'original-step-b', stageId: 'original-stage-b', title: 'Fikcyjne otrzymanie wyniku', taskKind: 'examination',
        instruction: 'Fikcyjna instrukcja.', requiredOutcome: 'resultReceipt', reminderRule: { kind: 'stage-offset', amount: 2, unit: 'week' }, includedByDefault: true },
      { id: 'original-step-c', stageId: 'original-stage-b', title: 'Fikcyjna konsultacja opcjonalna', taskKind: 'consultation',
        instruction: 'Fikcyjna instrukcja warunkowa.', requiredOutcome: 'performance', reminderRule: { kind: 'none' }, includedByDefault: false }
    ] };
}
const maps = (suffix, value = definition()) => ({
  stageIds: Object.fromEntries(value.stages.map((stage, index) => [stage.id, 'import-stage-' + index + '-' + suffix])),
  stepIds: Object.fromEntries(value.steps.map((step, index) => [step.id, 'import-step-' + index + '-' + suffix]))
});
const failed = result => { expect(result.ok).toBe(false); expect(result.issues.length).toBeGreaterThan(0); expect(result).not.toHaveProperty('text'); };

describe('single care-template portable file', () => {
  it('exports exactly one definition with explicit author, source and terms, without any I/O or account binding', async () => {
    const { transfer, forbidden } = api(), original = definition(), before = JSON.stringify(original);
    const output = await transfer.serialize(original);
    expect(output.ok).toBe(true); expect(output.fileName).toMatch(/\.vilda-template\.json$/);
    expect(output.contentDigest).toMatch(/^[a-f0-9]{64}$/);
    const envelope = JSON.parse(output.text);
    expect(Object.keys(envelope).sort()).toEqual(['contentDigest', 'definition', 'format']);
    expect(envelope.format).toBe('vilda-care-template/v1');
    expect(envelope.definition).toMatchObject({ name: original.name, purpose: original.purpose, labels: original.labels, publication: original.publication });
    expect(envelope.definition.stageOrder).toEqual(['stage-1', 'stage-2']);
    expect(envelope.definition.stages).toEqual([{ id: 'stage-1', title: 'Pierwszy fikcyjny etap', stepIds: ['step-1', 'step-2'] },
      { id: 'stage-2', title: 'Drugi fikcyjny etap', stepIds: ['step-3'] }]);
    expect(envelope.definition.steps.map(step => [step.id, step.stageId, step.title, step.requiredOutcome, step.includedByDefault])).toEqual([
      ['step-1', 'stage-1', 'Fikcyjne otrzymanie wyniku', 'resultReceipt', true],
      ['step-2', 'stage-1', 'Fikcyjna konsultacja opcjonalna', 'performance', false],
      ['step-3', 'stage-2', 'Fikcyjne sprawdzenie kompletu', 'decision', true]
    ]);
    expect(output.text).not.toContain('original-stage-'); expect(output.text).not.toContain('original-step-');
    expect(envelope.definition.publication.authors).toEqual(['Fikcyjny autor pierwotny']);
    for (const key of ['patients', 'patientId', 'templateId', 'accountId', 'keyBinding', 'slotId', 'sync', 'operations', 'revisions']) expect(envelope).not.toHaveProperty(key);
    const parsed = await transfer.parse(output.text);
    expect(parsed.ok).toBe(true); expect(parsed.definition).toEqual(envelope.definition); expect(parsed.contentDigest).toBe(output.contentDigest);
    expect(JSON.stringify(original)).toBe(before); expect(forbidden).not.toHaveBeenCalled();
  });

  it('imports a detached independent structure with all new IDs and keeps the original rights and source', async () => {
    const { transfer, model, forbidden } = api(), original = definition(), serialized = await transfer.serialize(original);
    const parsed = await transfer.parse(serialized.text), before = JSON.stringify(parsed.definition);
    const imported = await transfer.prepareImport(parsed.definition, maps('first', parsed.definition));
    expect(imported.ok).toBe(true); expect(model.validateDefinition(imported.definition).valid).toBe(true);
    expect(imported.definition.stageOrder).toEqual(['import-stage-0-first', 'import-stage-1-first']);
    expect(imported.definition.stages.map(stage => stage.id).sort()).toEqual(['import-stage-0-first', 'import-stage-1-first']);
    expect(imported.definition.steps.map(step => step.id).sort()).toEqual(['import-step-0-first', 'import-step-1-first', 'import-step-2-first']);
    const placed = new Map(imported.definition.stages.flatMap(stage => stage.stepIds.map(id => [id, stage.id])));
    for (const step of imported.definition.steps) expect(step.stageId).toBe(placed.get(step.id));
    expect(imported.definition.publication).toMatchObject({ id: original.publication.id, authors: original.publication.authors,
      sources: original.publication.sources, license: original.publication.license,
      origin: { id: original.publication.id, version: original.publication.version, contentDigest: serialized.contentDigest,
        authors: original.publication.authors, contributors: original.publication.contributors, sources: original.publication.sources,
        license: original.publication.license, attribution: original.publication.attribution, changes: original.publication.changes } });
    expect(imported.definition.publication.origin.instructionDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(parsed.definition)).toBe(before);
    imported.definition.publication.authors.push('Fikcyjny dopisek'); expect(original.publication.authors).toHaveLength(1);
    expect(forbidden).not.toHaveBeenCalled();
  });

  it('supports A→B save, edit, re-export and another import without replacing the original author with the recipient', async () => {
    const { transfer, model } = api(), original = definition(), file = await transfer.serialize(original);
    const parsed = await transfer.parse(file.text), imported = await transfer.prepareImport(parsed.definition, maps('second', parsed.definition));
    expect(imported.ok).toBe(true);
    const created = await model.prepareTemplateOperation(null, { templateId: 'fictional-recipient-template', operationId: 'fictional-recipient-create',
      baseToken: null, action: 'save', definition: imported.definition }, at);
    expect(created.ok).toBe(true);
    const modified = clone(imported.definition); modified.steps[0].instruction += '\nFikcyjne dostosowanie.';
    modified.publication.contributors.push('Fikcyjny autor dostosowania'); modified.publication.changes = 'Dostosowano fikcyjną instrukcję.';
    const changed = await model.prepareTemplateOperation(created.record, { templateId: 'fictional-recipient-template', operationId: 'fictional-recipient-adapt',
      baseToken: created.view.baseToken, action: 'save', definition: modified }, at);
    expect(changed.ok).toBe(true);
    const reexported = await transfer.serialize(changed.event.revision.definition);
    expect(reexported.ok).toBe(true);
    const received = await transfer.parse(reexported.text);
    expect(received.ok).toBe(true); expect(received.definition.publication.authors).toEqual(original.publication.authors);
    expect(received.definition.publication.contributors).toEqual(['Fikcyjny autor dostosowania']);
    expect(received.definition.publication.license).toEqual(original.publication.license);
    expect(received.definition.publication.origin).toEqual(imported.definition.publication.origin);
    expect(created.record.revisions[0].definition).toEqual(imported.definition);
    // A third physician receives the adapted file, not merely the original.
    // The second physician's credits and modification notice become protected
    // upstream information too, without nesting an unbounded chain of files.
    const thirdMaps = { stageIds: Object.fromEntries(received.definition.stages.map((stage, i) => [stage.id, 'third-stage-' + i])),
      stepIds: Object.fromEntries(received.definition.steps.map((step, i) => [step.id, 'third-step-' + i])) };
    const third = await transfer.prepareImport(received.definition, thirdMaps);
    expect(third.ok).toBe(true);
    expect(third.definition.publication.origin).toMatchObject({ authors: original.publication.authors,
      contributors: modified.publication.contributors, attribution: modified.publication.attribution, changes: modified.publication.changes });
    for (const stripCredit of [value => { value.publication.contributors = []; }, value => { value.publication.attribution = ''; },
      value => { value.publication.changes = ''; }]) {
      const stripped = clone(third.definition); stripCredit(stripped);
      expect(model.validateDefinition(stripped).valid).toBe(false);
      failed(await transfer.serialize(stripped));
    }
  });

  it('requires explicit publication metadata and refuses account/library envelopes instead of guessing a template', async () => {
    const { transfer } = api(), old = definition(); old.contentVersion = 1; delete old.publication;
    failed(await transfer.serialize(old));
    const output = await transfer.serialize(definition()), envelope = JSON.parse(output.text);
    for (const extra of [{ patients: [] }, { keyBinding: 'fictional-account-key' }, { definitions: [envelope.definition] }, { operations: [] }]) {
      failed(await transfer.parse(JSON.stringify({ ...envelope, ...extra })));
    }
    failed(await transfer.parse(JSON.stringify({ format: 'vilda-care-template-library/v1', namespace: {}, cipher: 'fictional' })));
    failed(await transfer.parse(JSON.stringify([envelope, envelope])));
    failed(await transfer.parse(JSON.stringify(envelope.definition)));
  });

  it('fails integrity checks on changed content or a forged digest and preserves caller data', async () => {
    const { transfer } = api(), exported = await transfer.serialize(definition()), envelope = JSON.parse(exported.text);
    envelope.definition.steps[0].instruction = 'Changed after export'; const tampered = JSON.stringify(envelope);
    failed(await transfer.parse(tampered)); expect(JSON.stringify(envelope)).toBe(tampered);
    const alteredDigest = JSON.parse(exported.text); alteredDigest.contentDigest = '0'.repeat(64);
    failed(await transfer.parse(JSON.stringify(alteredDigest)));
  });

  it('uses integrity as consistency only: text and declared author remain data, without author verification or script execution', async () => {
    const { transfer, forbidden } = api(), value = definition();
    value.name = '<img src=x onerror=alert(1)>'; value.publication.authors = ['<script>Fikcyjny autor</script>'];
    value.steps[0].instruction = '<script>Do not execute me</script>';
    const exported = await transfer.serialize(value), imported = await transfer.parse(exported.text);
    expect(imported.ok).toBe(true); expect(imported.definition.name).toBe(value.name);
    expect(imported.definition.publication.authors).toEqual(value.publication.authors);
    expect(imported.provenanceVerified).not.toBe(true); expect(imported.authorVerified).not.toBe(true);
    expect(forbidden).not.toHaveBeenCalled();
  });

  it('rejects unsupported versions, excess bytes and malformed JSON before returning any template', async () => {
    const { transfer } = api(), output = await transfer.serialize(definition()), envelope = JSON.parse(output.text);
    envelope.format = 'vilda-care-template/v999'; failed(await transfer.parse(JSON.stringify(envelope)));
    const future = JSON.parse(output.text); future.definition.contentVersion = 999; failed(await transfer.parse(JSON.stringify(future)));
    failed(await transfer.parse(output.text + ' '.repeat(600000)));
    failed(await transfer.parse('{"format":'));
    failed(await transfer.parse(null));
  });

  it('never invokes accessors supplied to serialize or import preparation', async () => {
    const { transfer } = api(), value = definition(), getter = vi.fn(() => { throw new Error('Accessor read'); });
    Object.defineProperty(value.publication, 'authors', { enumerable: true, get: getter });
    failed(await transfer.serialize(value)); failed(await transfer.prepareImport(value, maps('getter')));
    expect(getter).not.toHaveBeenCalled();
    const mapping = maps('mapping-getter');
    Object.defineProperty(mapping.stageIds, 'original-stage-a', { enumerable: true, get: getter });
    failed(await transfer.prepareImport(definition(), mapping)); expect(getter).not.toHaveBeenCalled();
  });

  it('asks for an application update when paired with an older model and never downgrades publication content', async () => {
    const { model, transfer, window, forbidden } = api(), value = definition(), file = await transfer.serialize(value);
    expect(file.ok).toBe(true);
    window.VildaCareTemplateModel = Object.freeze({ ...model, CONTENT_VERSION: 1 });
    for (const result of [await transfer.parse(file.text), await transfer.serialize(value), await transfer.prepareImport(value, maps('old-model'))]) {
      expect(result).toMatchObject({ ok: false, reason: 'CARE_TEMPLATE_UPDATE_REQUIRED' });
      expect(result).not.toHaveProperty('definition'); expect(result).not.toHaveProperty('text');
    }
    expect(forbidden).not.toHaveBeenCalled();
  });

  it('refuses partial/reused ID maps instead of accidentally linking imported work to source IDs', async () => {
    const { transfer } = api(), value = definition();
    const missing = maps('missing'); delete missing.stepIds['original-step-c'];
    const reused = maps('reused'); reused.stageIds['original-stage-a'] = 'original-stage-a';
    const collision = maps('collision'); collision.stepIds['original-step-a'] = collision.stageIds['original-stage-a'];
    for (const mapping of [missing, reused, collision]) failed(await transfer.prepareImport(value, mapping));
  });

  it('recognizes the same publication across independently remapped copies and distinguishes adapted content', async () => {
    const { transfer } = api(), original = definition(), copy = await transfer.prepareImport(original, maps('duplicates'));
    expect(copy.ok).toBe(true);
    const changed = clone(copy.definition); changed.steps[0].instruction = 'Fikcyjne dostosowanie.';
    changed.publication.contributors = ['Fikcyjny autor dostosowania']; changed.publication.changes = 'Zmieniono instrukcję.';
    const unrelated = definition(); unrelated.publication.id = 'fictional-unrelated-publication';
    const matches = await transfer.findDuplicates(original, [copy.definition, changed, unrelated]);
    expect(matches.exact).toEqual([0]); expect(matches.related).toEqual([1]);
  });

  it('keeps original non-redistribution terms on import and refuses another recipient export', async () => {
    const { transfer } = api(), original = definition(); original.publication.license.allowRedistribution = false;
    const first = await transfer.serialize(original); expect(first.ok).toBe(true);
    const parsed = await transfer.parse(first.text); expect(parsed.ok).toBe(true);
    const imported = await transfer.prepareImport(parsed.definition, maps('private', parsed.definition));
    expect(imported.ok).toBe(true); expect(imported.definition.publication.license.allowRedistribution).toBe(false);
    failed(await transfer.serialize(imported.definition));
  });

  it('allows unchanged no-adaptation import, but refuses a changed workflow without granting new rights', async () => {
    const { transfer, model } = api(), original = definition(); original.publication.license.allowAdaptation = false;
    const imported = await transfer.prepareImport(original, maps('fixed'));
    expect(imported.ok).toBe(true); expect(await transfer.isModified(imported.definition)).toBe(false);
    expect((await transfer.serialize(imported.definition)).ok).toBe(true);
    const changed = clone(imported.definition); changed.steps[0].instruction = 'Fikcyjna niedozwolona zmiana';
    changed.publication.contributors = ['Fikcyjny autor dostosowania']; changed.publication.changes = 'Zmieniono instrukcję.';
    expect(await transfer.isModified(changed)).toBe(true);
    failed(await transfer.serialize(changed));
    const created = await model.prepareTemplateOperation(null, { templateId: 'fictional-fixed-template', operationId: 'fictional-fixed-create',
      baseToken: null, action: 'save', definition: imported.definition }, at);
    expect(created.ok).toBe(true);
    const revised = await model.prepareTemplateOperation(created.record, { templateId: 'fictional-fixed-template', operationId: 'fictional-fixed-change',
      baseToken: created.view.baseToken, action: 'save', definition: changed }, at);
    expect(revised.ok).toBe(false);
  });

  it.each([
    value => { value.contentVersion = 1; delete value.publication; },
    value => { value.publication.origin = null; },
    value => { value.publication.authors = ['Fikcyjny odbiorca zamiast autora']; },
    value => { value.publication.sources = []; },
    value => { value.publication.license.allowRedistribution = false; },
    value => { value.publication.license.text = 'Nowe warunki zastępujące pierwotne.'; }
  ])('does not accept silent removal or replacement of existing imported provenance on save', async mutate => {
    const { transfer, model } = api(), imported = await transfer.prepareImport(definition(), maps('guard'));
    const created = await model.prepareTemplateOperation(null, { templateId: 'fictional-guarded-template', operationId: 'fictional-guarded-create',
      baseToken: null, action: 'save', definition: imported.definition }, at);
    expect(created.ok).toBe(true);
    const changed = clone(imported.definition); mutate(changed);
    const result = await model.prepareTemplateOperation(created.record, { templateId: 'fictional-guarded-template', operationId: 'fictional-guarded-change',
      baseToken: created.view.baseToken, action: 'save', definition: changed }, at);
    expect(result.ok).toBe(false); expect(created.record.revisions).toHaveLength(1);
  });
});
