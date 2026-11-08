import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(new URL('../../vilda_care_template_model.js', import.meta.url), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const at = { recordedAtISO: '2026-11-08T12:00:00.000Z' };
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function definition() {
  const step = (id, stageId, extra = {}) => ({ id, stageId, title: 'Fikcyjny krok ' + id,
    taskKind: 'documentation', instruction: 'Fikcyjna instrukcja\nbez danych pacjenta.',
    requiredOutcome: 'decision', reminderRule: { kind: 'none' }, includedByDefault: true, ...extra });
  return { contentVersion: 1, name: 'Fikcyjny szablon zastosowania', purpose: 'Fikcyjny cel organizacyjny.', labels: ['Fikcyjny'],
    stageOrder: ['stage-b', 'stage-a', 'stage-c'],
    stages: [
      { id: 'stage-a', title: 'Fikcyjny drugi etap', stepIds: ['step-a2', 'step-a1'] },
      { id: 'stage-b', title: 'Fikcyjny pierwszy etap', stepIds: ['step-b1', 'step-b2'] },
      { id: 'stage-c', title: 'Fikcyjny trzeci etap', stepIds: ['step-c1'] }
    ],
    steps: [step('step-a1', 'stage-a'), step('step-b2', 'stage-b', { includedByDefault: false,
      requiredOutcome: 'resultReceipt', reminderRule: { kind: 'stage-offset', amount: 0, unit: 'day' } }),
    step('step-c1', 'stage-c', { requiredOutcome: 'performance' }),
    step('step-b1', 'stage-b', { taskKind: 'examination', reminderRule: { kind: 'stage-offset', amount: 2, unit: 'month' } }),
    step('step-a2', 'stage-a', { includedByDefault: false, reminderRule: { kind: 'stage-offset', amount: 3, unit: 'week' } })]
  };
}
function model() {
  const forbidden = vi.fn(() => { throw new Error('Unexpected side effect'); });
  const win = { crypto: { subtle: webcrypto.subtle, getRandomValues: forbidden },
    localStorage: { getItem: forbidden, setItem: forbidden }, indexedDB: { open: forbidden },
    document: new Proxy({}, { get: forbidden }), fetch: forbidden, setTimeout: forbidden };
  vm.runInContext(source, vm.createContext({ window: win,
    Date: new Proxy(Date, { construct: forbidden, get: forbidden }), Math: { random: forbidden } }));
  return { api: win.VildaCareTemplateModel, win, forbidden };
}
// Match the existing guarded provider's CareTplDTO shape. Its definitions and
// revisions come from the actual production graph verifier, not hand-signed data.
function dto(view) {
  const revision = view.revisions.find(item => item.id === view.headRevisionId);
  return { templateId: view.templateId, status: view.needsReview ? 'conflict' : view.archived ? 'archived' : 'active',
    baseToken: view.baseToken, headRevisionId: view.headRevisionId, revisionId: view.headRevisionId,
    revisionNumber: revision?.revisionNumber ?? null, title: revision?.definition.name ?? '', definition: revision?.definition ?? null,
    stageCount: revision?.definition.stages.length ?? 0, stepCount: revision?.definition.steps.length ?? 0,
    conflicts: view.needsReview ? { heads: view.headVariants, archiveChoices: view.archiveVariants, observedOperationHeads: view.operationTips } : null,
    revisions: view.revisions, syncState: { pending: 0 } };
}
async function fixture(value = definition()) {
  const result = model();
  const prepared = await result.api.prepareTemplateOperation(null, { templateId: 'fictional-application-template',
    operationId: 'fictional-create', baseToken: null, action: 'save', definition: value }, at);
  expect(prepared.ok).toBe(true);
  return { ...result, prepared, view: dto(prepared.view) };
}
function options(value, selectedStepIds = value.steps.map(step => step.id)) {
  const selected = new Set(selectedStepIds);
  const stageIds = Object.fromEntries(value.stages.filter(stage => stage.stepIds.some(id => selected.has(id)))
    .map(stage => [stage.id, 'application-' + stage.id]));
  return { selectedStepIds, stageIds, stepIds: Object.fromEntries(selectedStepIds.map(id => [id, 'application-' + id])) };
}
const failure = result => {
  expect(result).toMatchObject({ ok: false, provenanceVerified: false, patientWriterAvailable: false });
  expect(result.issues.length).toBeGreaterThan(0);
  expect(result).not.toHaveProperty('source'); expect(result).not.toHaveProperty('definition');
};

describe('care template application RAM draft', () => {
  it('uses actual revision content, preserves explicit order and creates detached editable identities without I/O', async () => {
    const { api, view, win, forbidden } = await fixture();
    const before = JSON.stringify(view), selection = options(view.definition);
    freeze(view); freeze(selection); win.crypto.subtle = new Proxy({}, { get: forbidden });
    const result = api.prepareApplicationDraft(view, selection);
    expect(result).toMatchObject({ ok: true, provenanceVerified: false, patientWriterAvailable: false, issues: [],
      source: { templateId: view.templateId, revisionId: view.revisionId, revisionNumber: 1, baseToken: view.baseToken, definition: view.definition } });
    expect(result.definition.stageOrder).toEqual(['application-stage-b', 'application-stage-a', 'application-stage-c']);
    expect(result.definition.stages.map(stage => stage.id)).toEqual(result.definition.stageOrder);
    expect(result.definition.steps.map(step => step.id)).toEqual(['application-step-b1', 'application-step-b2', 'application-step-a2', 'application-step-a1', 'application-step-c1']);
    for (const copied of result.definition.steps) {
      const original = view.definition.steps.find(step => 'application-' + step.id === copied.id);
      expect(copied).toEqual({ ...original, id: 'application-' + original.id, stageId: 'application-' + original.stageId });
    }
    expect(api.validateDefinition(result.definition).valid).toBe(true);
    expect(JSON.stringify(view)).toBe(before);
    expect(forbidden).not.toHaveBeenCalled();
    expect(Object.isFrozen(result.definition)).toBe(false);
    expect(result).not.toHaveProperty('patientId'); expect(result).not.toHaveProperty('careContext');
  });

  it('pins a deeply immutable source while subsequent source and draft edits remain independent', async () => {
    const { api, view } = await fixture();
    const result = api.prepareApplicationDraft(view, options(view.definition));
    const pinned = JSON.stringify(result.source);
    for (const value of [result.source, result.source.definition, result.source.definition.stageOrder,
      result.source.definition.stages[0], result.source.definition.stages[0].stepIds,
      result.source.definition.steps[0], result.source.definition.steps[0].reminderRule]) expect(Object.isFrozen(value)).toBe(true);
    result.definition.name = 'Fikcyjna zmiana planu'; result.definition.steps[0].instruction = 'Fikcyjna zmiana kroku';
    result.definition.steps[0].reminderRule.amount = 17; result.definition.stageOrder.reverse();
    view.definition.name = 'Fikcyjna późniejsza zmiana biblioteki'; view.revisionId = 'later-revision';
    expect(JSON.stringify(result.source)).toBe(pinned);
    expect(() => { result.source.definition.steps[0].title = 'Nie zmieniaj źródła'; }).toThrow(TypeError);
  });

  it('includes exactly the explicit selection, preserves optional steps and drops only stages made empty by that selection', async () => {
    const { api, view } = await fixture();
    const selected = ['step-a1', 'step-b2'];
    const result = api.prepareApplicationDraft(view, options(view.definition, selected));
    expect(result.ok).toBe(true);
    expect(result.definition.stageOrder).toEqual(['application-stage-b', 'application-stage-a']);
    expect(result.definition.steps.map(step => step.id)).toEqual(['application-step-b2', 'application-step-a1']);
    expect(result.definition.steps[0]).toMatchObject({ includedByDefault: false, requiredOutcome: 'resultReceipt',
      reminderRule: { kind: 'stage-offset', amount: 0, unit: 'day' } });
    expect(result.source.definition.steps).toHaveLength(5); expect(result.source.definition.stages).toHaveLength(3);
    expect(api.validateDefinition(result.definition).valid).toBe(true);
  });

  it('accepts an all-optional source only with an explicit nonempty selection', async () => {
    const value = definition(); value.steps.forEach(step => { step.includedByDefault = false; });
    const { api, view } = await fixture(value);
    expect(api.prepareApplicationDraft(view, options(value, ['step-b2'])).ok).toBe(true);
    failure(api.prepareApplicationDraft(view, options(value, [])));
  });

  it.each([
    value => { delete value.selectedStepIds; }, value => { value.selectedStepIds = []; },
    value => { value.selectedStepIds = ['step-a1', 'step-a1']; }, value => { value.selectedStepIds = ['unknown']; },
    value => { value.selectedStepIds = ['stage-a']; }, value => { value.selectedStepIds = [null]; },
    value => { value.selectedStepIds = new Array(1); }, value => { value.patientId = 'fictional-patient-must-not-copy'; },
    value => { value.startDateISO = '2026-11-08'; }, value => { value.allowWrite = true; },
    value => { value.selectedStepIds.extra = true; }, value => { Object.defineProperty(value.selectedStepIds, 'hidden', { value: true }); }
  ])('rejects invalid, ambiguous or widened selection options', async change => {
    const { api, view } = await fixture(); const selection = options(view.definition); change(selection);
    failure(api.prepareApplicationDraft(view, selection));
  });

  it.each([
    value => { value.stageIds = {}; }, value => { delete value.stepIds['step-a1']; },
    value => { value.stepIds.extra = 'application-extra'; }, value => { value.stageIds.extra = 'application-extra'; },
    value => { value.stepIds['step-a1'] = value.stepIds['step-a2']; },
    value => { value.stepIds['step-a1'] = value.stageIds['stage-a']; },
    value => { value.stepIds['step-a1'] = 'step-a1'; }, value => { value.stageIds['stage-a'] = 'stage-a'; },
    value => { value.stepIds['step-a1'] = ''; }, value => { value.stepIds['step-a1'] = 'invalid/id'; },
    value => { value.stageIds = null; }
  ])('rejects incomplete, extra, colliding or reused ID maps', async change => {
    const { api, view } = await fixture(); const selection = options(view.definition); change(selection);
    failure(api.prepareApplicationDraft(view, selection));
  });

  it.each(['stage-c', 'step-c1', 'fictional-application-template'])('does not reuse omitted source or template ID %s', async reused => {
    const { api, view } = await fixture(); const selection = options(view.definition, ['step-a1']);
    selection.stepIds['step-a1'] = reused;
    failure(api.prepareApplicationDraft(view, selection));
  });

  it('rejects a new identifier equal to the pinned revision ID', async () => {
    const { api, view } = await fixture(); const selection = options(view.definition);
    selection.stepIds['step-a1'] = view.revisionId;
    failure(api.prepareApplicationDraft(view, selection));
  });

  it.each([
    value => { value.status = 'archived'; }, value => { value.status = 'conflict'; }, value => { value.status = 'unsupported'; },
    value => { value.readOnly = true; }, value => { value.readOnly = 'false'; }, value => { value.conflicts = {}; },
    value => { value.revisionId = 'historical-revision'; }, value => { value.headRevisionId = 'different-head'; },
    value => { value.revisionNumber = 0; }, value => { value.revisionNumber = null; }, value => { value.baseToken = ''; },
    value => { value.title = 'Fikcyjna inna nazwa'; }, value => { value.stageCount++; }, value => { value.stepCount++; },
    value => { value.revisions = []; }, value => { value.revisions.push(clone(value.revisions[0])); },
    value => { value.revisions[0].contentDigest = 'not-a-digest'; }, value => { value.revisions[0].revisionNumber++; },
    value => { value.revisions[0].recordedAtISO = '2026-02-31T12:00:00Z'; }, value => { value.revisions[0].operationId = 'bad/id'; },
    value => { value.revisions[0].parentRevisionId = ''; }, value => { value.revisions[0].unknown = true; },
    value => { value.patientId = 'fictional-patient-must-not-copy'; }, value => { value.definition.steps[0].requiredOutcome = 'inferred'; },
    value => { value.definition.steps[0].reminderRule = { kind: 'stage-offset', amount: '', unit: 'day' }; }
  ])('refuses unavailable or inconsistent concrete provider views', async change => {
    const { api, view } = await fixture(); const changed = clone(view); change(changed);
    failure(api.prepareApplicationDraft(changed, options(view.definition)));
  });

  it('refuses content substituted under the selected immutable revision', async () => {
    const { api, view } = await fixture(); const changed = clone(view);
    changed.definition.steps[0].instruction = 'Fikcyjna podmieniona treść';
    failure(api.prepareApplicationDraft(changed, options(view.definition)));
  });

  it('uses the latest concrete revision and refuses historical preview even when history is retained', async () => {
    const { api, view, prepared } = await fixture();
    const revisedDefinition = clone(view.definition); revisedDefinition.name = 'Fikcyjna nowa wersja';
    const revised = await api.prepareTemplateOperation(prepared.record, { templateId: view.templateId,
      operationId: 'fictional-revise', baseToken: view.baseToken, action: 'save', definition: revisedDefinition }, at);
    expect(revised.ok).toBe(true);
    const current = dto(revised.view), result = api.prepareApplicationDraft(current, options(current.definition));
    expect(result).toMatchObject({ ok: true, source: { revisionId: current.headRevisionId, revisionNumber: 2,
      definition: { name: revisedDefinition.name } } });
    const historical = { ...current, revisionId: view.revisionId, revisionNumber: 1, definition: view.definition, readOnly: true };
    failure(api.prepareApplicationDraft(historical, options(view.definition)));
  });

  it('does not execute input accessors, copy patient data or accept symbols/prototype payloads', async () => {
    const { api, view } = await fixture(); const selection = options(view.definition), getter = vi.fn(() => { throw Error('Do not invoke'); });
    for (const property of ['definition', 'status', 'patientId']) {
      const unsafe = clone(view); Object.defineProperty(unsafe, property, { enumerable: true, get: getter });
      failure(api.prepareApplicationDraft(unsafe, selection));
    }
    const nested = clone(view); Object.defineProperty(nested.definition.steps[0], 'instruction', { enumerable: true, get: getter });
    failure(api.prepareApplicationDraft(nested, selection));
    const unsafeSelection = options(view.definition); Object.defineProperty(unsafeSelection.selectedStepIds, '0', { enumerable: true, get: getter });
    failure(api.prepareApplicationDraft(view, unsafeSelection));
    const unsafeRevision = clone(view); Object.defineProperty(unsafeRevision.revisions[0], 'id', { enumerable: true, get: getter });
    failure(api.prepareApplicationDraft(unsafeRevision, selection));
    const tagged = clone(view); Object.defineProperty(tagged, Symbol.toStringTag, { get: getter });
    failure(api.prepareApplicationDraft(tagged, selection));
    const inherited = Object.assign(Object.create({ patientId: 'fictional-inherited-patient' }), view);
    failure(api.prepareApplicationDraft(inherited, selection));
    expect(getter).not.toHaveBeenCalled();
  });

  it.each([null, 'Fikcyjny obcy komunikat', { message: 'Fikcyjna obca treść błędu' }])('returns a fixed failure for hostile exceptions without echoing their contents', async thrown => {
    const { api, view } = await fixture();
    const unsafe = new Proxy(view, { getPrototypeOf() { throw thrown; } });
    expect(api.prepareApplicationDraft(unsafe, options(view.definition))).toEqual({ ok: false,
      provenanceVerified: false, patientWriterAvailable: false,
      issues: [{ code: 'CARE_TEMPLATE_APPLICATION_SOURCE_INVALID', path: ['source'], fieldPath: 'source' }] });
  });

  it('does not read an exception message accessor when a proxy refuses inspection', async () => {
    const { api, view } = await fixture(), message = vi.fn(() => { throw null; });
    const thrown = {}; Object.defineProperty(thrown, 'message', { get: message });
    const unsafe = new Proxy(view, { ownKeys() { throw thrown; } });
    const result = api.prepareApplicationDraft(unsafe, options(view.definition));
    failure(result); expect(result.issues[0].code).toBe('CARE_TEMPLATE_APPLICATION_SOURCE_INVALID');
    expect(message).not.toHaveBeenCalled();
  });

  it('accepts all 256 steps across 32 stages without truncation or implicit selection', async () => {
    const value = definition(), seed = value.steps[0]; value.stageOrder = []; value.stages = []; value.steps = [];
    for (let stage = 0; stage < 32; stage++) {
      const stageId = 'stage-' + stage, stepIds = [];
      for (let step = 0; step < 8; step++) {
        const id = 'step-' + stage + '-' + step; stepIds.push(id);
        value.steps.push({ ...seed, id, stageId, reminderRule: { kind: 'stage-offset', amount: stage + step, unit: 'week' } });
      }
      value.stageOrder.push(stageId); value.stages.push({ id: stageId, title: 'Fikcyjny etap ' + stage, stepIds });
    }
    const { api, view } = await fixture(value), result = api.prepareApplicationDraft(view, options(value));
    expect(result.ok).toBe(true); expect(result.definition.stages).toHaveLength(32); expect(result.definition.steps).toHaveLength(256);
    expect(new Set(result.definition.stageOrder.concat(result.definition.steps.map(step => step.id))).size).toBe(288);
    expect(api.validateDefinition(result.definition).valid).toBe(true);
  });
});
