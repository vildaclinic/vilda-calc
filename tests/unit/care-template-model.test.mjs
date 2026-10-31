import { readFileSync } from 'node:fs';
import { webcrypto, createHash } from 'node:crypto';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../../vilda_care_template_model.js', import.meta.url), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function model() {
  const forbidden = () => { throw new Error('Unexpected side effect'); };
  const window = { crypto: { subtle: webcrypto.subtle, getRandomValues: forbidden }, localStorage: { getItem: forbidden, setItem: forbidden },
    indexedDB: { open: forbidden }, document: new Proxy({}, { get: forbidden }), fetch: forbidden, setTimeout: forbidden };
  const context = vm.createContext({ window, Date: new Proxy(Date, { construct: forbidden, get: forbidden }), Math: { random: forbidden } });
  vm.runInContext(source, context);
  return window.VildaCareTemplateModel;
}
function definition(name = 'Fikcyjny schemat') {
  return { contentVersion: 1, name, purpose: 'Fikcyjna instrukcja organizacji.', labels: ['Fikcyjny'], stageOrder: ['stage-a'],
    stages: [{ id: 'stage-a', title: 'Fikcyjny etap', stepIds: ['step-a'] }],
    steps: [{ id: 'step-a', stageId: 'stage-a', title: 'Fikcyjna kontrola', taskKind: 'followup', instruction: '',
      requiredOutcome: 'performance', reminderRule: { kind: 'none' }, includedByDefault: true }] };
}
const at = { recordedAtISO: '2026-10-30T12:00:00.000Z' };
const create = (api, extra = {}) => api.prepareTemplateOperation(null, { templateId: 'fictional-template', operationId: 'op-create', baseToken: null, action: 'save', definition: definition(), ...extra }, at);
const save = async (api, record, operationId, next) => api.prepareTemplateOperation(record, { templateId: record.templateId, operationId,
  baseToken: (await api.getTemplateView(record)).baseToken, action: 'save', definition: next }, at);
const archive = async (api, record, operationId, archived) => api.prepareTemplateOperation(record, { templateId: record.templateId, operationId,
  baseToken: (await api.getTemplateView(record)).baseToken, action: 'archive', archived }, at);
const resolve = async (api, record, operationId, headRevisionId, archived = false) => api.prepareTemplateOperation(record, { templateId: record.templateId, operationId,
  baseToken: (await api.getTemplateView(record)).baseToken, action: 'resolve', headRevisionId, archived }, at);

// Independent fixture signing is deliberate: incoming malformed operations must
// be rejected even when their internal SHA values are self-consistent.
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
const sha = (scope, value) => createHash('sha256').update('care-template-library/' + scope + '\n' + canonical(value)).digest('hex');
function sign(operation) { operation.fingerprint = sha('intent-v1', operation.intent); delete operation.nodeDigest; operation.nodeDigest = sha('operation-v1', operation); return operation; }

describe('care template authoring codec', () => {
  it('exports a frozen private model without accessing clock, DOM, storage, network or randomness', async () => {
    const api = model();
    expect(Object.isFrozen(api)).toBe(true); expect(Object.isFrozen(api.LIMITS)).toBe(true);
    expect(Object.isFrozen(api.TASK_KINDS[0])).toBe(true);
    const first = await create(api);
    expect(first.ok).toBe(true); expect(first.view).toMatchObject({ integrityVerified: true, provenanceVerified: false, patientWriterAvailable: false });
    expect(api).not.toHaveProperty('writePatientPlan');
  });

  it('canonicalizes outer whitespace and line endings without truncation or changing IDs/order', () => {
    const api = model(), input = definition('  Fikcyjny\r\nschemat  '); input.steps[0].instruction = ' a\rb\r\nc ';
    freeze(input); const before = JSON.stringify(input), result = api.canonicalDefinition(input);
    expect(result.ok).toBe(true); expect(result.definition.name).toBe('Fikcyjny\nschemat'); expect(result.definition.steps[0].instruction).toBe('a\nb\nc');
    expect(result.definition.stageOrder).toEqual(['stage-a']); expect(JSON.stringify(input)).toBe(before);
    expect(api.sameDefinition(input, result.definition)).toBe(true);
    result.definition.stages[0].title = 'Detached'; expect(input.stages[0].title).toBe('Fikcyjny etap');
  });

  it('reports stable step/stage/path issues and keeps blank amount distinct from zero', () => {
    const api = model(), input = definition(); input.steps[0].requiredOutcome = null;
    input.steps[0].reminderRule = { kind: 'stage-offset', amount: '', unit: 'day' };
    const result = api.validateDraft(input);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual({ code: 'CARE_TEMPLATE_OUTCOME_REQUIRED', path: ['steps', 0, 'requiredOutcome'], fieldPath: 'steps.0.requiredOutcome', stageId: 'stage-a', stepId: 'step-a' });
    expect(result.issues.some(issue => issue.fieldPath === 'steps.0.reminderRule.amount')).toBe(true);
    expect(api.validateDraft(input, { section: 'name' }).valid).toBe(true);
    input.steps[0].requiredOutcome = 'decision'; input.steps[0].reminderRule.amount = 0;
    expect(api.validateDefinition(input).valid).toBe(true);
  });

  it.each(['performance', 'resultReceipt', 'decision'])('keeps task kind independent from explicit %s outcome', outcome => {
    const api = model(), input = definition(); input.steps[0].taskKind = 'examination'; input.steps[0].requiredOutcome = outcome; input.steps[0].includedByDefault = false;
    expect(api.canonicalDefinition(input)).toMatchObject({ ok: true, definition: { steps: [{ taskKind: 'examination', requiredOutcome: outcome, includedByDefault: false }] } });
  });

  it('accepts the full 32-stage/256-step structure, including repeated names and all-optional steps', () => {
    const api = model(), input = definition(); input.stageOrder = []; input.stages = []; input.steps = [];
    for (let stage = 0; stage < 32; stage++) {
      const stageId = 's-' + stage, stepIds = [];
      for (let index = 0; index < 8; index++) {
        const stepId = 't-' + stage + '-' + index; stepIds.push(stepId);
        input.steps.push({ ...definition().steps[0], id: stepId, stageId, title: 'To samo', includedByDefault: false });
      }
      input.stageOrder.push(stageId); input.stages.push({ id: stageId, title: 'Ten sam etap', stepIds });
    }
    expect(api.validateDefinition(freeze(input))).toEqual({ valid: true, issues: [] });
    const over = clone(input); over.steps.push({ ...over.steps[0], id: 'too-many' }); over.stages[0].stepIds.push('too-many');
    expect(api.canonicalDefinition(over).ok).toBe(false); expect(over.steps).toHaveLength(257);
  });

  it('applies UTF8 bytes as the primary limit without slicing Unicode or instructions', () => {
    const api = model(), input = definition(); input.steps = []; input.stages[0].stepIds = [];
    for (let index = 0; index < 8; index++) {
      const step = { ...definition().steps[0], id: 'unicode-' + index, instruction: '😀'.repeat(9500) };
      input.steps.push(step); input.stages[0].stepIds.push(step.id);
    }
    const before = JSON.stringify(input), result = api.canonicalDefinition(freeze(input));
    expect(result.ok).toBe(false); expect(result.issues.some(issue => issue.code === 'CARE_TEMPLATE_DEFINITION_LIMIT')).toBe(true);
    expect(JSON.stringify(input)).toBe(before);
  });

  it.each([
    value => { value.patientId = 'forbidden'; }, value => { value.steps[0].completedDateISO = '2026-10-30'; },
    value => { value.steps[0].reminderRule = { kind: 'none', amount: 0 }; },
    value => { value.stageOrder = ['stage-a', 'stage-a']; }, value => { value.labels = [' Same ', 'Same']; },
    value => { value.steps[0].requiredOutcome = 'done'; }, value => { value.steps[0].taskKind = 'unreviewed-specialty'; }
  ])('rejects malformed, inferred or unknown authoring fields', change => {
    const api = model(), input = definition(); change(input); expect(api.validateDefinition(input).valid).toBe(false);
  });

  it('never invokes accessors or drops cycles/non-JSON fields', () => {
    const api = model(), input = definition(); let accessed = false;
    Object.defineProperty(input, 'patientId', { enumerable: true, get() { accessed = true; throw new Error('Getter'); } });
    expect(api.canonicalDefinition(input).ok).toBe(false); expect(accessed).toBe(false);
    const cycle = definition(); cycle.loop = cycle; expect(api.validateDefinition(cycle).valid).toBe(false);
    const tagged = definition(); Object.defineProperty(tagged, Symbol.toStringTag, { get() { accessed = true; throw new Error('Tag getter'); } });
    expect(api.validateDefinition(tagged).valid).toBe(false); expect(accessed).toBe(false);
  });

  it('makes independent duplicates with wholly new stage/step IDs', () => {
    const api = model(), input = freeze(definition()), result = api.duplicateDefinition(input, { stageIds: { 'stage-a': 'new-stage' }, stepIds: { 'step-a': 'new-step' } });
    expect(result.ok).toBe(true); expect(api.validateDefinition(result.definition).valid).toBe(true);
    expect(result.definition.steps[0]).toMatchObject({ id: 'new-step', stageId: 'new-stage' });
    result.definition.steps[0].reminderRule.kind = 'different'; expect(input.steps[0].reminderRule).toEqual({ kind: 'none' });
    expect(api.duplicateDefinition(input, { stageIds: { 'stage-a': 'new-stage' }, stepIds: { 'step-a': 'stage-a' } }).ok).toBe(false);
    expect(api.duplicateDefinition(input, { stageIds: { 'stage-a': 'new-stage', 'step-a': 'new-step' }, stepIds: {} }).ok).toBe(false);
  });

  it('copies only whitelisted V1 names and known kinds into a RAM draft with unknown outcomes', () => {
    const api = model(), patient = { id: 'patient-plan-secret', patientId: 'patient-secret', title: 'Patient title must not copy',
      body: 'Clinical body must not copy', careContext: { version: 1, role: 'plan', goal: 'Clinical goal', status: 'closed', log: [{ text: 'Clinical reason' }],
        steps: [{ id: 'original-a', title: 'Fikcyjna nazwa', kind: 'Badanie', state: 'done', resultNoteId: 'clinical-original', reminderDateISO: '2026-11-01', instruction: 'Clinical instruction' },
          { id: 'original-b', title: 'Fikcyjna nazwa', kind: 'toString', state: 'waiting' }] } };
    const before = JSON.stringify(patient); freeze(patient);
    const result = api.copyPatientStructureDraft(patient, { legacyStageId: 'new-stage', stepIds: { 'original-a': 'new-a', 'original-b': 'new-b' } });
    expect(result).toMatchObject({ ok: true, requiresNameReview: true, definition: { name: '', purpose: '', labels: [], steps: [
      { id: 'new-a', title: 'Fikcyjna nazwa', taskKind: 'examination', instruction: '', requiredOutcome: null, reminderRule: { kind: 'none' }, includedByDefault: true },
      { id: 'new-b', title: 'Fikcyjna nazwa', taskKind: 'other', requiredOutcome: null }
    ] } });
    const serialized = JSON.stringify(result.definition);
    for (const secret of ['patient-secret', 'patient-plan-secret', 'original-a', 'original-b', 'clinical-original', 'Clinical', '2026-11-01', 'done', 'waiting']) expect(serialized).not.toContain(secret);
    expect(JSON.stringify(patient)).toBe(before); expect(api.validateDefinition(result.definition).valid).toBe(false);
    expect(api.copyPatientStructureDraft({ version: 2, role: 'plan', steps: [] }, {}).ok).toBe(false);
  });

  it('invalidates visible-text review on any name/instruction/label change, without pretending to detect PHI', () => {
    const api = model(), input = definition(), key = api.reviewTextKey(input);
    input.steps[0].instruction = 'Fikcyjny dopisek'; expect(api.reviewTextKey(input)).not.toBe(key);
    input.steps[0].instruction = ''; input.labels.push('Nowy'); expect(api.reviewTextKey(input)).not.toBe(key);
    expect(api.reviewTextKey(freeze(definition()))).toBe(key);
  });
});

describe('care template immutable graph', () => {
  it('creates deterministic revisions/events, verifies frozen records and detaches every result', async () => {
    const api = model(), a = await create(api), b = await create(api);
    expect(a.ok).toBe(true); expect(a.event).toEqual(b.event); expect(a.record).toEqual(b.record);
    const input = freeze(a.record), before = JSON.stringify(input), verified = await api.verifyTemplateRecord(input), view = await api.getTemplateView(input);
    expect(verified.ok).toBe(true); expect(view.revisions[0].revisionNumber).toBe(1);
    verified.record.revisions[0].definition.name = 'Detached'; view.revisions[0].definition.name = 'Detached view';
    expect(JSON.stringify(input)).toBe(before);
    expect(a.event).toMatchObject({ domain: 'care-template-library', version: 1, templateId: 'fictional-template', operation: { kind: 'create', archived: false, parents: [] } });
    expect(a.event).not.toHaveProperty('revisions');
  });

  it('recognizes exact durable retries before stale CAS or authoring time, and rejects changed intent', async () => {
    const api = model(), first = await create(api), second = await save(api, first.record, 'op-edit', definition('Fikcyjna edycja'));
    const request = { templateId: first.record.templateId, operationId: 'op-create', baseToken: null, action: 'save', definition: definition() };
    const retry = await api.prepareTemplateOperation(second.record, request, { recordedAtISO: 'invalid' });
    expect(retry).toMatchObject({ ok: true, reused: true, outcome: first.outcome }); expect(retry).not.toHaveProperty('event');
    expect(await api.prepareTemplateOperation(second.record, { ...request, definition: definition('Changed') }, at)).toMatchObject({ ok: false, reason: 'CARE_TEMPLATE_OPERATION_ID_REUSED' });
    const oldBase = first.view.baseToken;
    expect(await api.prepareTemplateOperation(second.record, { ...request, operationId: 'new-op', baseToken: oldBase }, at)).toMatchObject({ ok: false, reason: 'CARE_TEMPLATE_STALE_BASE' });
    expect(await api.operationOutcome(second.record, 'op-create', first.event.operation.fingerprint)).toMatchObject({ found: true, reused: true, outcome: first.outcome });
  });

  it('persists canonical no-op receipts beyond 100 operations without extra content revisions', async () => {
    const api = model(), first = await create(api); let state = first;
    for (let index = 0; index < 105; index++) {
      state = await api.prepareTemplateOperation(state.record, { templateId: state.record.templateId, operationId: 'noop-' + index,
        baseToken: state.view.baseToken, action: 'save', definition: definition('  Fikcyjny schemat  ') }, at);
      expect(state.ok).toBe(true); expect(state.event.operation.kind).toBe('noop'); expect(state.event).not.toHaveProperty('revision');
    }
    expect(state.record.operations).toHaveLength(106); expect(state.record.revisions).toHaveLength(1);
    expect(state.view.baseToken).not.toBe(first.view.baseToken); expect(state.view.headRevisionId).toBe(first.outcome.headRevisionId);
    const retry = await api.prepareTemplateOperation(state.record, { templateId: 'fictional-template', operationId: 'op-create', baseToken: null, action: 'save', definition: definition() }, at);
    expect(retry).toMatchObject({ ok: true, reused: true, outcome: first.outcome });
    expect(retry.record.operations).toHaveLength(106);
  });

  it.each(['head', 'archive'])('retains concurrent head/%s branches and only explicit resolve can accept them', async kind => {
    const api = model(), base = await create(api), left = await save(api, base.record, 'left-edit', definition('Fikcyjna A'));
    const right = kind === 'head' ? await save(api, base.record, 'right-edit', definition('Fikcyjna B')) : await archive(api, base.record, 'right-archive', true);
    const merged = await api.mergeTemplateRecords(left.record, right.record);
    expect(merged.ok).toBe(true); expect(merged.view.needsReview).toBe(true); expect(merged.view.headRevisionId).toBeNull(); expect(merged.view.archived).toBeNull();
    const before = JSON.stringify(merged.record);
    for (const request of [
      { action: 'save', definition: definition('Fikcyjna trzecia') }, { action: 'save', definition: definition('Fikcyjna A') }, { action: 'archive', archived: true }, { action: 'archive', archived: false }
    ]) {
      expect(await api.prepareTemplateOperation(merged.record, { templateId: base.record.templateId, operationId: 'not-resolution', baseToken: merged.view.baseToken, ...request }, at))
        .toMatchObject({ ok: false, reason: 'CARE_TEMPLATE_RESOLUTION_REQUIRED' });
    }
    expect(JSON.stringify(merged.record)).toBe(before);
    const retry = await api.prepareTemplateOperation(merged.record, { templateId: 'fictional-template', operationId: 'left-edit', baseToken: base.view.baseToken, action: 'save', definition: definition('Fikcyjna A') }, at);
    expect(retry).toMatchObject({ ok: true, reused: true });
    const accepted = await resolve(api, merged.record, 'explicit-resolve', left.outcome.headRevisionId, false);
    expect(accepted.ok).toBe(true); expect(accepted.view.needsReview).toBe(false); expect(accepted.event.operation.parents).toEqual(merged.view.operationTips);
    expect(accepted.event.operation).toMatchObject({ kind: 'resolve', headRevisionId: left.outcome.headRevisionId, archived: false });
    expect(accepted.record.revisions).toHaveLength(kind === 'head' ? 3 : 2);
  });

  it('reopens review for a previously unseen branch arriving after resolution', async () => {
    const api = model(), base = await create(api), a = await save(api, base.record, 'a', definition('A')), b = await save(api, base.record, 'b', definition('B')), c = await save(api, base.record, 'c', definition('C'));
    const ab = await api.mergeTemplateRecords(a.record, b.record), resolved = await resolve(api, ab.record, 'resolve-ab', a.outcome.headRevisionId);
    const late = await api.mergeTemplateRecords(resolved.record, c.record);
    expect(late.ok).toBe(true); expect(late.view.needsReview).toBe(true); expect(late.record.revisions).toHaveLength(4);
  });

  it('coalesces equal archive branches while retaining both writers, and restores explicitly', async () => {
    const api = model(), base = await create(api), a = await archive(api, base.record, 'archive-a', true), b = await archive(api, base.record, 'archive-b', true);
    const merged = await api.mergeTemplateRecords(a.record, b.record);
    expect(merged.view).toMatchObject({ needsReview: false, archived: true }); expect(merged.record.operations).toHaveLength(3);
    expect(await save(api, merged.record, 'cannot-edit-archive', definition('Edit'))).toMatchObject({ ok: false, reason: 'CARE_TEMPLATE_ARCHIVED' });
    const restored = await archive(api, merged.record, 'restore', false);
    expect(restored.ok).toBe(true); expect(restored.view.archived).toBe(false); expect(restored.record.revisions).toEqual(base.record.revisions);
  });

  it('does not let receipts dominate a concurrent writer or launder explicit resolution', async () => {
    const api = model(), base = await create(api), noop = await save(api, base.record, 'noop', definition()), branch = await save(api, base.record, 'branch', definition('Branch'));
    const combined = await api.mergeTemplateRecords(noop.record, branch.record);
    expect(combined.view.needsReview).toBe(false); expect(combined.view.headRevisionId).toBe(branch.outcome.headRevisionId);
    const other = await archive(api, base.record, 'other-archive', true), conflict = await api.mergeTemplateRecords(combined.record, other.record);
    expect(conflict.view.needsReview).toBe(true);
    const forged = clone(noop.event.operation); forged.id = 'forged-noop'; forged.parents = conflict.view.operationTips;
    forged.intent.baseToken = conflict.view.baseToken; sign(forged);
    const result = await api.applyTemplateEvent(conflict.record, { domain: 'care-template-library', version: 1, templateId: 'fictional-template', operation: forged });
    expect(result).toMatchObject({ ok: false, kind: 'invalid' }); expect(result.issues.some(issue => issue.code === 'CARE_TEMPLATE_RESOLUTION_REQUIRED')).toBe(true);
  });

  it('is commutative, associative and idempotent for immutable record union', async () => {
    const api = model(), base = await create(api), a = await save(api, base.record, 'a', definition('A')), b = await save(api, base.record, 'b', definition('B')), c = await archive(api, base.record, 'c', true);
    const ab = await api.mergeTemplateRecords(a.record, b.record), ba = await api.mergeTemplateRecords(b.record, a.record);
    expect(ab.record).toEqual(ba.record); expect(ab.view).toEqual(ba.view);
    const left = await api.mergeTemplateRecords(ab.record, c.record), bc = await api.mergeTemplateRecords(b.record, c.record), right = await api.mergeTemplateRecords(a.record, bc.record);
    expect(left.record).toEqual(right.record); expect(left.view.baseToken).toBe(right.view.baseToken);
    expect((await api.mergeTemplateRecords(left.record, left.record)).record).toEqual(left.record);
  });

  it('stages verified out-of-order events as incomplete and completes them without losing nodes', async () => {
    const api = model(), base = await create(api), next = await save(api, base.record, 'edit', definition('Next'));
    const staged = await api.applyTemplateEvent(null, freeze(next.event));
    expect(staged).toMatchObject({ ok: false, kind: 'incomplete' }); expect(staged.record.operations[0].id).toBe('edit');
    expect(staged.record.revisions).toHaveLength(1); expect(staged).not.toHaveProperty('view');
    const complete = await api.applyTemplateEvent(staged.record, base.event);
    expect(complete.ok).toBe(true); expect(complete.record).toEqual(next.record);
  });

  it('rejects corrupt out-of-order data before calling it incomplete', async () => {
    const api = model(), base = await create(api), next = await save(api, base.record, 'edit', definition('Next')), event = clone(next.event);
    event.revision.definition.name = 'Tampered';
    expect(await api.applyTemplateEvent(null, event)).toMatchObject({ ok: false, kind: 'invalid' });
    const collision = clone(base.record); collision.operations[0].recordedAtISO = '2026-10-29T10:00:00Z'; sign(collision.operations[0]);
    collision.revisions[0].recordedAtISO = collision.operations[0].recordedAtISO;
    expect(await api.mergeTemplateRecords(base.record, collision)).toMatchObject({ ok: false, kind: 'invalid' });
  });

  it('requires an event to contain exactly its own created revision, even before dependencies arrive', async () => {
    const api = model(), base = await create(api), next = await save(api, base.record, 'edit', definition('Next')), archived = await archive(api, base.record, 'archive', true);
    const missing = clone(next.event); delete missing.revision;
    expect(await api.applyTemplateEvent(null, missing)).toMatchObject({ ok: false, kind: 'invalid' });
    const unrelated = clone(next.event); unrelated.revision = clone(base.event.revision);
    expect(await api.applyTemplateEvent(null, unrelated)).toMatchObject({ ok: false, kind: 'invalid' });
    const smuggled = clone(archived.event); smuggled.revision = clone(next.event.revision);
    expect(await api.applyTemplateEvent(null, smuggled)).toMatchObject({ ok: false, kind: 'invalid' });
    expect(await api.applyTemplateEvent(null, next.event)).toMatchObject({ ok: false, kind: 'incomplete' });
  });

  it('retains unknown protected formats detached and refuses to author them', async () => {
    const api = model(), unknown = freeze({ domain: 'care-template-library', version: 99, templateId: 'fictional-future', future: { rules: ['untouched'] } });
    const decoded = api.decodeTemplateRecord(unknown); expect(decoded).toMatchObject({ ok: false, kind: 'unsupported', readOnly: true, raw: unknown });
    decoded.raw.future.rules.push('detached'); expect(unknown.future.rules).toEqual(['untouched']);
    expect(await api.prepareTemplateOperation(unknown, { templateId: 'fictional-future', operationId: 'nope', baseToken: null, action: 'save', definition: definition() }, at)).toMatchObject({ ok: false, kind: 'unsupported' });
  });

  it('refuses a 65th immutable revision without pruning and still recognizes an old retry at capacity', async () => {
    const api = model(), base = await create(api), record = clone(base.record); let head = base.outcome.headRevisionId;
    // Real create plus independently signed history exercises the production
    // verifier/authoring bound without calling an expensive UI loop 64 times.
    for (let index = 1; index < api.LIMITS.maxRevisions; index++) {
      const operationId = 'revision-' + String(index).padStart(3, '0'), nextDefinition = definition('Fikcyjna wersja ' + index);
      const revisionId = 'ctr_' + sha('revision-id-v1', { templateId: record.templateId, operationId });
      const contentDigest = sha('definition-v1', nextDefinition);
      const prior = record.operations.at(-1), outcome = { headRevisionId: revisionId, archived: false, noOp: false };
      const operation = sign({ id: operationId, parents: [prior.id], kind: 'revise', recordedAtISO: at.recordedAtISO,
        intent: { action: 'save', templateId: record.templateId, baseToken: sha('base-token-v1', record), definitionDigest: contentDigest }, headRevisionId: revisionId, outcome });
      record.revisions.push({ id: revisionId, parentRevisionId: head, definition: nextDefinition, contentDigest, operationId, recordedAtISO: at.recordedAtISO });
      record.operations.push(operation); head = revisionId;
    }
    expect((await api.verifyTemplateRecord(record)).ok).toBe(true);
    const before = JSON.stringify(record), refused = await save(api, freeze(record), 'revision-over-cap', definition('Fikcyjna za duża historia'));
    expect(refused).toMatchObject({ ok: false, reason: 'CARE_TEMPLATE_CAPACITY', kind: 'limited' }); expect(JSON.stringify(record)).toBe(before);
    const retry = await api.prepareTemplateOperation(record, { templateId: record.templateId, operationId: 'op-create', baseToken: null, action: 'save', definition: definition() }, at);
    expect(retry).toMatchObject({ ok: true, reused: true }); expect(retry.record.revisions).toHaveLength(64);
    const receipt = await save(api, record, 'receipt-at-revision-cap', definition('Fikcyjna wersja 63'));
    expect(receipt.ok).toBe(true); expect(receipt.record.revisions).toHaveLength(64); expect(receipt.event.operation.kind).toBe('noop');
  });

  it('bounds operations and parents explicitly rather than truncating a reader graph', async () => {
    const api = model(), base = await create(api), tooMany = clone(base.record);
    tooMany.operations = Array.from({ length: api.LIMITS.maxOperations + 1 }, (_, index) => ({ ...clone(base.event.operation), id: 'op-' + index }));
    const result = api.decodeTemplateRecord(freeze(tooMany));
    expect(result.kind).toBe('limited'); expect(result.raw.operations).toHaveLength(2049); expect(result).not.toHaveProperty('record');
    const parents = clone(base.record); parents.operations[0].parents = Array.from({ length: 65 }, (_, index) => 'parent-' + index).sort();
    expect(api.decodeTemplateRecord(parents).kind).toBe('limited'); expect(parents.operations[0].parents).toHaveLength(65);
  });

  it('uses code-unit ID order for identical tokens independent of locale or insertion order', async () => {
    const api = model(), base = await create(api), branches = [];
    for (const operationId of ['az', 'aZ', 'a_', 'a-']) branches.push(await archive(api, base.record, operationId, true));
    let record = base.record;
    for (const branch of branches) record = (await api.mergeTemplateRecords(record, branch.record)).record;
    const ordered = record.operations.map(operation => operation.id);
    expect(ordered).toEqual(ordered.slice().sort());
    const reversed = clone(record); reversed.operations.reverse(); reversed.revisions.reverse();
    expect((await api.getTemplateView(reversed)).baseToken).toBe((await api.getTemplateView(record)).baseToken);
  });

  it.each(['_op', '.op', '-op', ':op', 'x'.repeat(129), 'x'.repeat(160)])('rejects an operation ID outside the transport grammar before authoring: %s', async operationId => {
    const api = model();
    expect(api.OP_ID_PATTERN).toBe('^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'); expect(api.validateOperationId(operationId)).toBe(false);
    const result = await create(api, { operationId });
    expect(result).toMatchObject({ ok: false, reason: 'CARE_TEMPLATE_REQUEST_INVALID' });
    expect(result.issues).toContainEqual({ code: 'CARE_TEMPLATE_OPERATION_ID_INVALID', path: ['operationId'], fieldPath: 'operationId' });
    expect(result).not.toHaveProperty('record'); expect(result).not.toHaveProperty('event');
    expect(await api.operationOutcome(null, operationId, '0'.repeat(64))).toEqual({ found: false, reason: 'CARE_TEMPLATE_OPERATION_ID_INVALID' });
  });

  it('roundtrips colon operation IDs, maximum128 IDs and their creator/parent references unchanged', async () => {
    const api = model(), first = await create(api, { operationId: 'op:device.1', templateId: '_local-entity' });
    expect(first.ok).toBe(true); expect(api.validateOperationId('op:device.1')).toBe(true); expect(api.validateOperationId('x'.repeat(128))).toBe(true);
    expect(first.event.revision.operationId).toBe('op:device.1');
    const next = await save(api, first.record, 'x'.repeat(128), definition('Next'));
    expect(next.ok).toBe(true); expect(next.event.operation.parents).toEqual(['op:device.1']);
    const initial = await api.applyTemplateEvent(null, first.event), applied = await api.applyTemplateEvent(initial.record, next.event);
    expect(applied.ok).toBe(true); expect(applied.record).toEqual(next.record);
    expect(await api.operationOutcome(applied.record, 'op:device.1', first.event.operation.fingerprint)).toMatchObject({ found: true, reused: true, outcome: first.outcome });
    expect((await create(api, { templateId: 'entity:colon', operationId: 'valid-op' })).ok).toBe(false);
  });

  it.each(['id', 'parent', 'creator'])('rejects corrupted persisted %s operation identity instead of staging it incomplete', async field => {
    const api = model(), base = await create(api), next = await save(api, base.record, 'valid-next', definition('Next')), bad = clone(next.event);
    const path = field === 'id' ? ['operations', 0, 'id'] : field === 'parent' ? ['operations', 0, 'parents', 0] : ['revisions', 0, 'operationId'];
    if (field === 'id') { bad.operation.id = '_bad'; bad.revision.operationId = '_bad'; }
    if (field === 'parent') bad.operation.parents = ['_bad'];
    if (field === 'creator') bad.revision.operationId = '_bad';
    const raw = { domain: bad.domain, version: bad.version, templateId: bad.templateId, operations: [bad.operation], revisions: [bad.revision] };
    const decoded = api.decodeTemplateRecord(raw);
    expect(decoded).toMatchObject({ ok: false, kind: 'invalid' });
    expect(decoded.issues.some(issue => issue.code === 'CARE_TEMPLATE_OPERATION_ID_INVALID' && JSON.stringify(issue.path) === JSON.stringify(path))).toBe(true);
    expect(await api.applyTemplateEvent(null, bad)).toMatchObject({ ok: false, kind: 'invalid' });
  });

  it('rejects graph cycles, altered hashes, foreign templates and missing mandatory controls', async () => {
    const api = model(), base = await create(api);
    const badHash = clone(base.record); badHash.operations[0].fingerprint = '0'.repeat(64);
    expect(await api.verifyTemplateRecord(badHash)).toMatchObject({ ok: false, kind: 'invalid' });
    const cycle = clone(base.record); cycle.operations[0].parents = ['op-create']; sign(cycle.operations[0]);
    expect(await api.verifyTemplateRecord(cycle)).toMatchObject({ ok: false, kind: 'invalid' });
    const foreign = clone(base.record); foreign.operations[0].intent.templateId = 'other'; sign(foreign.operations[0]);
    expect(await api.verifyTemplateRecord(foreign)).toMatchObject({ ok: false, kind: 'invalid' });
    const missing = clone(base.record); delete missing.operations[0].archived; sign(missing.operations[0]);
    expect(await api.verifyTemplateRecord(missing)).toMatchObject({ ok: false, kind: 'invalid' });
  });
});
