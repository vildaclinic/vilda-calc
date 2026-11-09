import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(new URL('../../vilda_care_template_model.js', import.meta.url), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const at = { recordedAtISO: '2026-11-09T12:00:00.000Z' };
function api() {
  const forbidden = vi.fn(() => { throw new Error('Unexpected side effect'); });
  const window = { crypto: { subtle: webcrypto.subtle, getRandomValues: forbidden }, URL, fetch: forbidden,
    localStorage: { getItem: forbidden, setItem: forbidden }, indexedDB: { open: forbidden },
    document: new Proxy({}, { get: forbidden }), setTimeout: forbidden };
  vm.runInNewContext(source, { window, URL, Date: new Proxy(Date, { construct: forbidden, get: forbidden }), Math: { random: forbidden } });
  return { model: window.VildaCareTemplateModel, forbidden };
}
function definition(version = 2) {
  const result = { contentVersion: version, name: 'Fikcyjny szablon przenośny', purpose: 'Fikcyjna instrukcja organizacji.',
    labels: ['Fikcyjny'], stageOrder: ['source-stage'], stages: [{ id: 'source-stage', title: 'Fikcyjny etap', stepIds: ['source-step'] }],
    steps: [{ id: 'source-step', stageId: 'source-stage', title: 'Fikcyjna kontrola', taskKind: 'followup',
      instruction: 'Bez danych pacjentów.', requiredOutcome: 'decision', reminderRule: { kind: 'none' }, includedByDefault: true }] };
  if (version === 2) result.publication = { id: 'fictional-publication', version: '1.0', authors: ['Fikcyjny autor opracowania'], contributors: [],
    sources: [{ title: 'Fikcyjne źródło', url: 'https://example.org/fikcyjne-zrodlo', version: '2026' }],
    license: { id: 'custom', url: '', text: 'Fikcyjne warunki: wolno przekazywać i dostosowywać z zachowaniem autorstwa.',
      allowRedistribution: true, allowAdaptation: true }, attribution: 'Fikcyjne opracowanie z podaniem źródła.', changes: '', origin: null };
  return result;
}
async function create(model, value = definition(), operationId = 'fixture-create') {
  return model.prepareTemplateOperation(null, { templateId: 'fictional-template', operationId, baseToken: null, action: 'save', definition: value }, at);
}
function dto(view) {
  const revision = view.revisions.find(item => item.id === view.headRevisionId);
  return { templateId: view.templateId, status: 'active', baseToken: view.baseToken, headRevisionId: view.headRevisionId,
    revisionId: view.headRevisionId, revisionNumber: revision.revisionNumber, title: revision.definition.name,
    definition: revision.definition, stageCount: revision.definition.stages.length, stepCount: revision.definition.steps.length,
    conflicts: null, revisions: view.revisions };
}

describe('care template publication metadata', () => {
  it('keeps the historical V1 canonical payload and every immutable digest byte-for-byte', async () => {
    const { model, forbidden } = api(), result = await create(model, definition(1));
    expect(result.ok).toBe(true);
    // Captured from the production V1 codec on audyt 422a9a7b before extension.
    expect(result.record.revisions[0].contentDigest).toBe('79af7b85851544423b6ab4369318cb84f22c18e4fdc44b3c399b878846aa2964');
    expect(result.record.revisions[0].id).toBe('ctr_0af249308cb9603c24208a52eeeb792bfe432859b9d11a05e9ab215ab450f4df');
    expect(result.record.operations[0].fingerprint).toBe('6efb81ae0b3631036cde31d27ee6e788d41f319161359625f4b2679d7a690066');
    expect(result.record.operations[0].nodeDigest).toBe('b038504529a5ea949487b08b193954c4a601b1031b05d371cbe55522e949b13f');
    expect(result.view.baseToken).toBe('95ffa6d0ce5bdc57f6d5be9ea8b816107c4eb277aba8d14cc87e7e9d481d2b2f');
    expect(result.record.revisions[0].definition).not.toHaveProperty('publication');
    expect(forbidden).not.toHaveBeenCalled();
  });

  it('saves authorship, sources and terms as immutable content and carries it through an event and merge', async () => {
    const { model, forbidden } = api(), value = definition(), created = await create(model, value);
    expect(created.ok).toBe(true);
    expect(created.record).toMatchObject({ domain: 'care-template-library', version: 1 });
    expect(created.record.revisions[0].definition.publication).toEqual(value.publication);
    expect((await model.verifyTemplateRecord(created.record)).ok).toBe(true);
    const received = await model.applyTemplateEvent(null, created.event);
    expect(received.ok).toBe(true);
    expect(received.record.revisions[0].definition.publication).toEqual(value.publication);
    const updated = clone(value); updated.steps[0].instruction += '\nFikcyjne uzupełnienie.';
    updated.publication.contributors.push('Fikcyjny autor uzupełnienia'); updated.publication.changes = 'Uzupełniono instrukcję.';
    const revised = await model.prepareTemplateOperation(created.record, { templateId: 'fictional-template', operationId: 'fictional-revise',
      baseToken: created.view.baseToken, action: 'save', definition: updated }, at);
    expect(revised.ok).toBe(true);
    const merged = await model.mergeTemplateRecords(received.record, revised.record);
    expect(merged.ok).toBe(true); expect(merged.record.revisions).toHaveLength(2);
    expect(merged.record.revisions.find(item => item.id === revised.view.headRevisionId).definition.publication).toEqual(updated.publication);
    expect(merged.record.revisions.find(item => item.id === created.view.headRevisionId).definition.publication).toEqual(value.publication);
    expect(forbidden).not.toHaveBeenCalled();
  });

  it('treats a publication change as content, leaving the previous revision untouched', async () => {
    const { model } = api(), first = await create(model), before = JSON.stringify(first.record);
    const changed = definition(); changed.publication.sources[0].version = '2027';
    const result = await model.prepareTemplateOperation(first.record, { templateId: 'fictional-template', operationId: 'new-publication-revision',
      baseToken: first.view.baseToken, action: 'save', definition: changed }, at);
    expect(result.ok).toBe(true); expect(result.event.operation.kind).toBe('revise');
    expect(result.record.revisions).toHaveLength(2);
    expect(result.event.revision.contentDigest).not.toBe(first.event.revision.contentDigest);
    expect(JSON.stringify(first.record)).toBe(before);
  });

  it('preserves publication through independent duplication and the actual patient-application RAM draft', async () => {
    const { model } = api(), value = definition(), created = await create(model, value);
    expect(created.ok).toBe(true);
    const maps = { stageIds: { 'source-stage': 'new-stage' }, stepIds: { 'source-step': 'new-step' } };
    const duplicate = model.duplicateDefinition(value, maps);
    expect(duplicate.ok).toBe(true); expect(duplicate.definition.publication).toEqual(value.publication);
    duplicate.definition.publication.authors.push('Fikcyjny dopisek'); expect(value.publication.authors).toHaveLength(1);
    const applied = model.prepareApplicationDraft(dto(created.view), { selectedStepIds: ['source-step'], ...maps });
    expect(applied.ok).toBe(true);
    expect(applied.source.definition.publication).toEqual(value.publication);
    expect(applied.definition.publication).toEqual(value.publication);
    expect(applied.definition.steps[0]).toMatchObject({ id: 'new-step', stageId: 'new-stage' });
    expect(Object.isFrozen(applied.source.definition.publication)).toBe(true);
  });

  it('invalidates a public-text review when exportable authorship, terms or source notices change', () => {
    const { model } = api(), original = definition(), reviewed = model.reviewTextKey(original);
    for (const change of [value => { value.publication.authors[0] = 'Inny fikcyjny autor'; },
      value => { value.publication.license.text += ' Fikcyjny dopisek.'; }, value => { value.publication.sources[0].title += ' Fikcyjny dopisek.'; },
      value => { value.publication.attribution += ' Fikcyjny dopisek.'; }, value => { value.publication.changes = 'Fikcyjny opis zmian.'; }]) {
      const modified = clone(original); change(modified);
      expect(model.reviewTextKey(modified)).not.toBe(reviewed);
    }
    expect(model.reviewTextKey(original)).toBe(reviewed);
  });

  it('compares actual reusable instructions independently of local IDs, attribution and outer whitespace', async () => {
    const { model } = api(), original = definition();
    const copy = model.duplicateDefinition(original, { stageIds: { 'source-stage': 'fresh-stage' }, stepIds: { 'source-step': 'fresh-step' } }).definition;
    copy.name = '  ' + copy.name + '  '; copy.steps[0].instruction = '\r\n' + copy.steps[0].instruction + '\r\n';
    copy.publication.contributors.push('Fikcyjny dopisek'); copy.publication.changes = 'Fikcyjna informacja.';
    expect(model.instructionContent(copy)).toEqual(model.instructionContent(original));
    expect(await model.instructionDigest(copy)).toBe(await model.instructionDigest(original));
    const detached = model.instructionContent(original); detached.stages[0].steps[0].instruction = 'Changed outside the source';
    expect(original.steps[0].instruction).toBe('Bez danych pacjentów.');
    copy.steps[0].requiredOutcome = 'resultReceipt';
    expect(await model.instructionDigest(copy)).not.toBe(await model.instructionDigest(original));
  });

  it.each([
    value => { delete value.publication; },
    value => { value.publication.authors = []; },
    value => { value.publication.authors = ['  ']; },
    value => { value.publication.authors = Array.from({ length: 1000 }, (_, i) => 'Fikcyjny ' + i); },
    value => { value.publication.id = ''; },
    value => { value.publication.version = ''; },
    value => { value.publication.license = null; },
    value => { value.publication.license.allowRedistribution = 'true'; },
    value => { value.publication.license.allowAdaptation = 'true'; },
    value => { value.publication.license.id = 'unrecognised-license'; },
    value => { value.publication.license.text = ''; },
    value => { value.publication.sources[0].url = 'javascript:alert(1)'; },
    value => { value.publication.sources[0].url = 'data:text/html,Fikcyjny'; },
    value => { value.publication.sources[0].url = 'https://fictional:secret@example.org/zrodlo'; },
    value => { value.publication.sources[0].url = 'https://example.org/\u0000zrodlo'; },
    value => { value.publication.sources[0].accountKey = 'must-not-be-accepted'; },
    value => { value.publication.patientId = 'must-not-be-accepted'; },
    value => { value.publication.unknown = 'must-not-be-dropped'; },
    value => { value.contentVersion = 1; }
  ])('rejects incomplete, unbounded, unsafe or unknown publication fields', mutate => {
    const { model } = api(), value = definition(); mutate(value);
    const result = model.canonicalDefinition(value);
    expect(result.ok).toBe(false); expect(result.issues.length).toBeGreaterThan(0);
  });

  it('rejects nested publication accessors without reading them', () => {
    const { model } = api(), value = definition(), getter = vi.fn(() => { throw new Error('Accessor read'); });
    Object.defineProperty(value.publication.license, 'text', { enumerable: true, get: getter });
    expect(model.canonicalDefinition(value).ok).toBe(false); expect(getter).not.toHaveBeenCalled();
  });

  it('recognizes CC BY 4.0 only with its actual redistribution/adaptation grant and canonical license link', () => {
    const { model } = api(), value = definition();
    value.publication.license = { id: 'CC-BY-4.0', url: 'https://creativecommons.org/licenses/by/4.0/', text: '',
      allowRedistribution: true, allowAdaptation: true };
    expect(model.canonicalDefinition(value).ok).toBe(true);
    for (const change of [license => { license.allowRedistribution = false; }, license => { license.allowAdaptation = false; },
      license => { license.url = 'https://example.org/different-terms'; }, license => { license.text = 'Dodatkowy zakaz komercyjnego użycia.'; }]) {
      const changed = clone(value); change(changed.publication.license);
      expect(model.canonicalDefinition(changed).ok).toBe(false);
    }
  });

  it('keeps unsupported future content read-only and preserves its complete original record', async () => {
    const { model } = api(), value = (await create(model)).record;
    value.revisions[0].definition.contentVersion = 777; value.revisions[0].definition.publication.future = { arbitrary: ['Do not discard'] };
    const before = JSON.stringify(value), decoded = model.decodeTemplateRecord(value);
    expect(decoded).toMatchObject({ ok: false, kind: 'unsupported', readOnly: true });
    expect(decoded.raw).toEqual(value); expect(JSON.stringify(value)).toBe(before);
    decoded.raw.revisions[0].definition.publication.future.arbitrary.push('Detached');
    expect(value.revisions[0].definition.publication.future.arbitrary).toHaveLength(1);
  });
});
