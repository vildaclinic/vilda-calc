import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const files = ['vilda_care_plan_model.js', 'vilda_care_template_model.js', 'vilda_care_plan_mutation.js'];
const sources = files.map(file => readFileSync(new URL('../../' + file, import.meta.url), 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));
const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
  : value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}'
    : JSON.stringify(value);
const clock = Object.freeze({ recordedAtISO: '2026-11-08T12:00:00.000Z', recordedLocalDateISO: '2026-11-08', originTimeZone: 'Europe/Warsaw' });
const day = '2026-11-01';
const ids = { first: 'plan-stage-first', second: 'plan-stage-second', result: 'plan-step-result', decision: 'plan-step-decision', followup: 'plan-step-followup' };

function runtime() {
  const forbidden = vi.fn(() => { throw new Error('Unexpected side effect'); });
  const win = { crypto: { subtle: webcrypto.subtle, getRandomValues: forbidden }, fetch: forbidden,
    localStorage: { getItem: forbidden, setItem: forbidden }, indexedDB: { open: forbidden },
    document: new Proxy({}, { get: forbidden }), setTimeout: forbidden };
  const context = vm.createContext({ window: win, Date: new Proxy(Date, { construct: forbidden, get: forbidden }),
    Math: new Proxy(Math, { get: (target, key) => key === 'random' ? forbidden : Reflect.get(target, key) }) });
  sources.forEach(source => vm.runInContext(source, context));
  return { win, api: win.VildaCarePlanMutation, model: win.VildaCarePlanModel, templates: win.VildaCareTemplateModel, forbidden };
}
function definition() {
  const step = (id, stageId, extra = {}) => ({ id, stageId, title: 'Fikcyjny krok ' + id, taskKind: 'examination',
    instruction: 'Fikcyjna instrukcja organizacyjna.', requiredOutcome: 'performance', reminderRule: { kind: 'none' }, includedByDefault: true, ...extra });
  return { contentVersion: 1, name: 'Fikcyjny plan etapowy', purpose: 'Fikcyjny cel planu.', labels: ['Fikcyjne'],
    stageOrder: ['source-first', 'source-second'],
    stages: [{ id: 'source-first', title: 'Fikcyjny pierwszy etap', stepIds: ['source-result', 'source-decision'] },
      { id: 'source-second', title: 'Fikcyjny drugi etap', stepIds: ['source-followup'] }],
    steps: [step('source-followup', 'source-second', { taskKind: 'followup', reminderRule: { kind: 'stage-offset', amount: 1, unit: 'month' } }),
      step('source-decision', 'source-first', { taskKind: 'documentation', requiredOutcome: 'decision' }),
      step('source-result', 'source-first', { requiredOutcome: 'resultReceipt', reminderRule: { kind: 'stage-offset', amount: 0, unit: 'day' } })] };
}
function dto(view) {
  const revision = view.revisions.find(item => item.id === view.headRevisionId);
  return { templateId: view.templateId, status: 'active', baseToken: view.baseToken, headRevisionId: view.headRevisionId,
    revisionId: view.headRevisionId, revisionNumber: revision.revisionNumber, title: revision.definition.name,
    definition: revision.definition, stageCount: revision.definition.stages.length, stepCount: revision.definition.steps.length,
    conflicts: null, revisions: view.revisions, syncState: { pending: 0 } };
}
async function fixture(options = {}) {
  const f = { ...runtime(), sequence: 0 };
  const prepared = await f.templates.prepareTemplateOperation(null, { templateId: 'fictional-template', operationId: 'fictional-template-save',
    baseToken: null, action: 'save', definition: options.definition || definition() }, { recordedAtISO: clock.recordedAtISO });
  expect(prepared.ok).toBe(true);
  f.templateView = dto(prepared.view);
  const selectedStepIds = options.selectedStepIds || ['source-result', 'source-decision', 'source-followup'];
  const selected = new Set(selectedStepIds);
  const stageIds = { 'source-first': ids.first, 'source-second': ids.second };
  const stepIds = { 'source-result': ids.result, 'source-decision': ids.decision, 'source-followup': ids.followup };
  f.draft = f.templates.prepareApplicationDraft(f.templateView, {
    selectedStepIds,
    stageIds: Object.fromEntries(f.templateView.definition.stages.filter(stage => stage.stepIds.some(id => selected.has(id))).map(stage => [stage.id, stageIds[stage.id]])),
    stepIds: Object.fromEntries(selectedStepIds.map(id => [id, stepIds[id]]))
  });
  expect(f.draft.ok).toBe(true);
  f.command = { action: 'createFromTemplate', operationId: 'fictional-plan-create', planId: 'fictional-plan', patientId: 'fictional-patient',
    expectedRevision: null, draft: { source: f.draft.source, definition: f.draft.definition }, documentIds: {
      reminders: Object.fromEntries(f.draft.definition.steps.map(step => [step.id, 'fictional-reminder-' + step.id]))
    } };
  if (options.edit) options.edit(f.command);
  f.created = f.api.prepareTransaction(null, f.command, clock);
  if (options.expectFailure) return f;
  success(f, f.created); f.state = f.created.state;
  // Source hashing belongs to obtaining a verified template view. Applying a
  // prepared draft and changing a plan must use no browser or cryptographic I/O.
  f.win.crypto.subtle = new Proxy({}, { get: f.forbidden });
  return f;
}
function success(f, result) {
  expect(result).toMatchObject({ ok: true, provenanceVerified: false, writerAvailable: false });
  expect(f.api.validateState(result.state).ok).toBe(true);
  expect(f.model.decodeCarePlanRecord(result.state.record).kind).toBe('v2');
  return result;
}
function failed(result) {
  expect(result).toMatchObject({ ok: false, provenanceVerified: false, writerAvailable: false });
  expect(result.code).toMatch(/^CARE_/);
  expect(result).not.toHaveProperty('state'); expect(result).not.toHaveProperty('documentEffects');
}
function command(f, action, extra = {}) {
  return { action, operationId: 'fictional-operation-' + (++f.sequence), planId: 'fictional-plan', patientId: 'fictional-patient',
    expectedRevision: f.state.record.rev, ...extra };
}
function change(f, action, extra = {}, at = clock) {
  const input = command(f, action, extra), before = JSON.stringify(f.state);
  const result = f.api.prepareTransaction(f.state, input, at);
  expect(JSON.stringify(f.state)).toBe(before);
  if (result.ok) { success(f, result); f.state = result.state; }
  return { ...result, input };
}
function view(f) { return f.model.projectCarePlan(f.model.decodeCarePlanRecord(f.state.record), { todayLocalDateISO: clock.recordedLocalDateISO }); }
function stage(f, id = ids.first) { return view(f).stages.find(item => item.id === id); }
function activate(f, id = ids.first, effectiveDateISO = day) { return change(f, 'activateStage', { stageId: id, effectiveDateISO }); }
function fact(f, stepId, kind, extra = {}) {
  return change(f, 'recordFact', { stepId, kind, factId: 'fictional-fact-' + (f.sequence + 1), effectiveDateISO: day,
    evidence: { noteId: 'fictional-evidence-' + (f.sequence + 1), sourceRecordRevAtCapture: 4 }, ...extra });
}
function finishFirst(f) {
  success(f, activate(f)); success(f, fact(f, ids.result, 'resultReceipt')); success(f, fact(f, ids.decision, 'decision'));
  success(f, change(f, 'reviewStage', { stageId: ids.first, effectiveDateISO: day }));
}

describe('pure staged care plan mutation transactions', () => {
  it('copies a real template revision into detached stages without starting work or granting write authority', async () => {
    const f = await fixture({ edit: cmd => { cmd.draft.definition.name = 'Fikcyjna zmieniona nazwa'; cmd.draft.definition.steps[0].instruction = 'Fikcyjna zmiana przed zapisem.'; } });
    expect(f.state.format).toBe('vilda-care-plan-state/v1');
    expect(f.state.source).toEqual(f.draft.source);
    expect(f.state.record).toMatchObject({ id: 'fictional-plan', patientId: 'fictional-patient', title: 'Fikcyjna zmieniona nazwa', category: 'care-plan', rev: 1 });
    expect(f.state.record.careContext).toMatchObject({ version: 2, role: 'plan', status: 'active', stageOrder: [ids.first, ids.second], facts: [], associations: [] });
    expect(view(f).stages.map(item => item.controlState)).toEqual(['planned', 'planned']);
    expect(view(f).nextAction).toMatchObject({ type: 'startStage', stageId: ids.first });
    expect(f.state.record.careContext.steps.map(item => item.id)).toEqual([ids.result, ids.decision, ids.followup]);
    expect(f.state.record.careContext.steps[0]).toMatchObject({ requiredOutcome: 'resultReceipt', reminderRule: { kind: 'stage-offset', amount: 0, unit: 'day' }, reminderSchedule: null });
    expect(f.state.source.definition.name).toBe('Fikcyjny plan etapowy');
    expect(f.created.preconditions).toEqual({ planId: 'fictional-plan', patientId: 'fictional-patient', expectedRevision: null });
    expect(f.created.readDependencies).toEqual([]);
    expect(f.created.documentEffects.filter(effect => effect.document)).toEqual([]);
    expect(view(f)).toMatchObject({ readOnly: true, provenanceVerified: false, writeCapability: { available: false } });
    expect(f.forbidden).not.toHaveBeenCalled();
  });

  it('requires explicit activation, review and next activation, and never closes a completed plan automatically', async () => {
    const f = await fixture();
    failed(activate(f, ids.second)); failed(change(f, 'reviewStage', { stageId: ids.first, effectiveDateISO: day }));
    success(f, activate(f));
    expect(stage(f).steps[0].reminderSchedule).toMatchObject({ dateISO: day, origin: 'stage-activation' });
    failed(activate(f, ids.second)); failed(change(f, 'reviewStage', { stageId: ids.first, effectiveDateISO: day }));
    success(f, fact(f, ids.result, 'performance'));
    expect(stage(f).steps[0].progress).toBe('waiting');
    failed(change(f, 'reviewStage', { stageId: ids.first, effectiveDateISO: day }));
    success(f, fact(f, ids.result, 'resultReceipt')); success(f, fact(f, ids.decision, 'decision'));
    expect(stage(f).readyForReview).toBe(true); expect(stage(f).controlState).toBe('active');
    expect(stage(f, ids.second).controlState).toBe('planned');
    expect(view(f).nextAction.type).toBe('reviewStage');
    success(f, change(f, 'reviewStage', { stageId: ids.first, effectiveDateISO: day }));
    expect(stage(f).reviewStale).toBe(false); expect(view(f).nextAction.type).toBe('startStage');
    success(f, activate(f, ids.second));
    expect(stage(f, ids.second).steps[0].reminderSchedule.dateISO).toBe('2026-12-01');
    success(f, fact(f, ids.followup, 'performance'));
    success(f, change(f, 'reviewStage', { stageId: ids.second, effectiveDateISO: day }));
    expect(view(f).nextAction.type).toBe('decidePlan');
    expect(f.state.record.careContext.status).toBe('active'); expect(f.forbidden).not.toHaveBeenCalled();
  });

  it('preserves an explicit subset as an independent plan while pinning the complete original source', async () => {
    const f = await fixture({ selectedStepIds: ['source-followup'], edit: cmd => {
      cmd.draft.definition.steps[0].instruction = 'Fikcyjna instrukcja zmieniona przed zastosowaniem.';
    } });
    expect(f.state.record.careContext.stageOrder).toEqual([ids.second]);
    expect(f.state.record.careContext.steps).toHaveLength(1);
    expect(f.state.record.careContext.steps[0]).toMatchObject({ id: ids.followup, requiredOutcome: 'performance',
      instruction: 'Fikcyjna instrukcja zmieniona przed zastosowaniem.', reminderRule: { kind: 'stage-offset', amount: 1, unit: 'month' } });
    expect(f.state.source.definition.stageOrder).toEqual(['source-first', 'source-second']);
    expect(f.state.source.definition.steps).toHaveLength(3);
    expect(view(f).nextAction).toMatchObject({ type: 'startStage', stageId: ids.second });
    success(f, activate(f, ids.second));
    expect(stage(f, ids.second).controlState).toBe('active');
  });

  it('can attach evidence and record facts on a planned stage without starting that stage or creating current work', async () => {
    const f = await fixture();
    const associated = change(f, 'associate', { stepId: ids.followup, associationId: 'fictional-association', kind: 'event',
      evidence: { noteId: 'fictional-existing-event', sourceRecordRevAtCapture: 7 } });
    success(f, associated);
    expect(associated.readDependencies).toEqual([{ noteId: 'fictional-existing-event', patientId: 'fictional-patient', expectedRevision: 7, kind: 'event' }]);
    expect(f.state.record.careContext.facts).toEqual([]);
    success(f, fact(f, ids.followup, 'performance'));
    expect(stage(f, ids.second).controlState).toBe('planned');
    expect(stage(f, ids.second).steps[0].progress).toBe('resolved');
    expect(view(f).attentionItems.every(item => item.type !== 'work')).toBe(true);
    expect(view(f).nextAction).toMatchObject({ type: 'startStage', stageId: ids.first });
  });

  it('creates a document and its factual reference together, while existing evidence is only a revision dependency', async () => {
    const f = await fixture(); success(f, activate(f));
    const existing = fact(f, ids.result, 'performance'); success(f, existing);
    expect(existing.readDependencies).toContainEqual(expect.objectContaining({ noteId: existing.input.evidence.noteId, patientId: 'fictional-patient', expectedRevision: 4 }));
    expect(existing.documentEffects.filter(effect => effect.document)).toEqual([]);
    const input = command(f, 'recordFact', { stepId: ids.result, factId: 'fictional-receipt', kind: 'resultReceipt', effectiveDateISO: '2026-11-02',
      document: { id: 'fictional-new-document', title: 'Fikcyjny wynik', body: 'Fikcyjna treść dokumentu.' } });
    const result = f.api.prepareTransaction(f.state, input, clock); success(f, result);
    const document = result.documentEffects.find(effect => effect.document)?.document;
    expect(document).toMatchObject({ id: 'fictional-new-document', patientId: 'fictional-patient', title: 'Fikcyjny wynik', body: 'Fikcyjna treść dokumentu.', clinicalDateISO: '2026-11-02', category: 'observation', careContext: { role: 'result', planId: 'fictional-plan', stepId: ids.result } });
    expect(document).not.toHaveProperty('labResult');
    expect(result.state.record.careContext.facts.find(item => item.id === 'fictional-receipt')).toMatchObject({ evidence: { noteId: document.id }, kind: 'resultReceipt' });
    expect(result.readDependencies).toEqual([]);
  });

  it('does not silently infer a receipt, decision or performance from a linked document', async () => {
    const f = await fixture(); success(f, activate(f));
    success(f, change(f, 'associate', { stepId: ids.result, associationId: 'fictional-result-link', kind: 'result',
      evidence: { noteId: 'fictional-result-document', sourceRecordRevAtCapture: 1 } }));
    expect(f.state.record.careContext.facts).toEqual([]); expect(stage(f).steps[0].progress).toBe('pending');
    failed(change(f, 'reviewStage', { stageId: ids.first, effectiveDateISO: day }));
  });

  it('rejects future facts, duplicate outcomes and a receipt preceding performance without changing the plan', async () => {
    const f = await fixture(); success(f, activate(f));
    failed(fact(f, ids.result, 'performance', { effectiveDateISO: '2026-11-09' }));
    success(f, fact(f, ids.result, 'performance', { effectiveDateISO: '2026-11-04' }));
    failed(fact(f, ids.result, 'performance', { effectiveDateISO: '2026-11-05' }));
    failed(fact(f, ids.result, 'resultReceipt', { effectiveDateISO: '2026-11-03' }));
    expect(f.state.record.careContext.facts).toHaveLength(1);
    success(f, fact(f, ids.result, 'resultReceipt', { effectiveDateISO: '2026-11-04' }));
    expect(stage(f).steps[0].progress).toBe('resolved');
  });

  it('omits only by an explicit reason and preserves the original decision when reopening an omission', async () => {
    const f = await fixture(); success(f, activate(f));
    failed(change(f, 'omitStep', { stepId: ids.result, reason: ' ', effectiveDateISO: day, documentId: 'fictional-empty-reason' }));
    const omission = change(f, 'omitStep', { stepId: ids.result, reason: 'Fikcyjna jawna decyzja o pominięciu.', effectiveDateISO: day, documentId: 'fictional-omission-document' });
    success(f, omission); expect(stage(f).steps[0].progress).toBe('omitted'); expect(f.state.record.careContext.facts).toEqual([]);
    const preserved = clone(f.state.operations);
    failed(fact(f, ids.result, 'resultReceipt'));
    success(f, change(f, 'reopenStep', { stepId: ids.result, reason: 'Fikcyjna decyzja o powrocie.', effectiveDateISO: '2026-11-02', documentId: 'fictional-reopen-step-document' }));
    expect(stage(f).steps[0].progress).toBe('pending'); expect(stage(f).steps[0].omission).toBeNull();
    expect(f.state.operations.slice(0, preserved.length)).toEqual(preserved);
    failed(change(f, 'reopenStep', { stepId: ids.result, reason: 'Fikcyjny powrót.', effectiveDateISO: '2026-11-02', documentId: 'fictional-reopen-again' }));
    success(f, fact(f, ids.result, 'resultReceipt'));
    failed(change(f, 'reopenStep', { stepId: ids.result, reason: 'Nie usuwa faktów.', effectiveDateISO: '2026-11-02', documentId: 'fictional-reopen-fact' }));
  });

  it('requires explicit reopening of the latest reviewed stage and retains previous review history', async () => {
    const f = await fixture(); finishFirst(f);
    const reviewed = clone(stage(f).control.review), operations = clone(f.state.operations);
    failed(fact(f, ids.result, 'performance'));
    success(f, change(f, 'reopenStage', { stageId: ids.first, reason: 'Fikcyjna ponowna ocena.', effectiveDateISO: '2026-11-03', documentId: 'fictional-reopen-stage' }));
    expect(stage(f).controlState).toBe('active'); expect(stage(f).control.review).toBeNull();
    expect(f.state.operations.slice(0, operations.length)).toEqual(operations);
    expect(JSON.stringify(f.state.operations)).toContain(reviewed.operationId);
    success(f, change(f, 'reviewStage', { stageId: ids.first, effectiveDateISO: '2026-11-03' }));
    success(f, activate(f, ids.second, '2026-11-03'));
    failed(change(f, 'reopenStage', { stageId: ids.first, reason: 'Nie wycofuje następnego etapu.', effectiveDateISO: '2026-11-04', documentId: 'fictional-invalid-reopen-stage' }));
  });

  it('allows a future manual reminder only after activation without fabricating any clinical event', async () => {
    const f = await fixture();
    failed(change(f, 'setReminder', { stepId: ids.result, dateISO: '2027-01-15', time: '09:30' }));
    success(f, activate(f));
    success(f, change(f, 'setReminder', { stepId: ids.result, dateISO: '2027-01-15', time: '09:30' }));
    expect(stage(f).steps[0].reminderSchedule).toMatchObject({ origin: 'manual', dateISO: '2027-01-15', time: '09:30' });
    expect(f.state.record.careContext.facts).toEqual([]); expect(f.state.record.careContext.associations).toEqual([]);
    success(f, change(f, 'setReminder', { stepId: ids.result, dateISO: null, time: null }));
    expect(stage(f).steps[0].reminderSchedule).toBeNull();
  });

  it('uses the existing calendar rule when an explicit activation falls at the end of a month', async () => {
    const sourceDefinition = definition();
    sourceDefinition.steps.find(step => step.id === 'source-result').reminderRule = { kind: 'stage-offset', amount: 1, unit: 'month' };
    const f = await fixture({ definition: sourceDefinition });
    success(f, activate(f, ids.first, '2026-01-31'));
    expect(stage(f).steps[0].reminderSchedule.dateISO).toBe('2026-02-28');
    expect(f.state.record.careContext.facts).toEqual([]);
    expect(f.forbidden).not.toHaveBeenCalled();
  });

  it('closes unfinished work only by explicit confirmation and reopens without changing evidence or stages', async () => {
    const f = await fixture(); success(f, activate(f)); success(f, fact(f, ids.result, 'performance'));
    const before = clone(f.state.record.careContext);
    failed(change(f, 'closePlan', { reason: 'other', text: 'Fikcyjna decyzja zamknięcia.', effectiveDateISO: day, documentId: 'fictional-close-no-confirm', confirmOpenWork: false }));
    success(f, change(f, 'closePlan', { reason: 'other', text: 'Fikcyjna decyzja zamknięcia.', effectiveDateISO: day, documentId: 'fictional-close', confirmOpenWork: true }));
    expect(f.state.record.careContext.status).toBe('closed'); expect(view(f).attentionItems).toEqual([]);
    expect(f.state.record.careContext.steps).toEqual(before.steps); expect(f.state.record.careContext.facts).toEqual(before.facts);
    failed(fact(f, ids.result, 'resultReceipt'));
    success(f, change(f, 'reopenPlan', { reason: 'Fikcyjny powrót do planu.', effectiveDateISO: '2026-11-02', documentId: 'fictional-reopen-plan' }));
    expect(f.state.record.careContext.status).toBe('active'); expect(stage(f).controlState).toBe('active');
    expect(f.state.record.careContext.facts).toEqual(before.facts); expect(stage(f).steps[0].progress).toBe('waiting');
  });

  it('returns an exact retry against the newest state without replaying documents or dependencies', async () => {
    const f = await fixture(); const activation = activate(f); success(f, activation);
    const result = fact(f, ids.result, 'performance'); success(f, result);
    const current = clone(f.state);
    const retry = f.api.prepareTransaction(f.state, activation.input, { ...clock, recordedAtISO: '2026-11-08T14:00:00.000Z' });
    success(f, retry); expect(retry.reused).toBe(true); expect(retry.state).toEqual(current);
    expect(retry.documentEffects).toEqual([]); expect(retry.readDependencies).toEqual([]);
    const createRetry = f.api.prepareTransaction(f.state, f.command, clock);
    success(f, createRetry); expect(createRetry.reused).toBe(true); expect(createRetry.state).toEqual(current);
    expect(createRetry.documentEffects).toEqual([]);
    failed(f.api.prepareTransaction(f.state, { ...activation.input, effectiveDateISO: '2026-11-02' }, clock));
  });

  it('preserves an explicit original revision zero without inventing a missing revision', async () => {
    const f = await fixture();
    const result = fact(f, ids.result, 'performance', { evidence: { noteId: 'fictional-revision-zero', sourceRecordRevAtCapture: 0 } });
    success(f, result);
    expect(result.readDependencies).toContainEqual({ noteId: 'fictional-revision-zero', patientId: 'fictional-patient', expectedRevision: 0, kind: 'performance' });
    failed(fact(f, ids.result, 'resultReceipt', { evidence: { noteId: 'fictional-missing-revision' } }));
  });

  it('closes and reopens at allowed text boundaries without truncating the original documentation', async () => {
    const f = await fixture({ edit: cmd => { cmd.draft.definition.name = 'F'.repeat(240); } });
    const body = 'F'.repeat(f.api.LIMITS.maxDocumentTextUnits);
    const closed = change(f, 'closePlan', { reason: 'F'.repeat(240), text: body, effectiveDateISO: day, documentId: 'fictional-long-close', confirmOpenWork: true });
    success(f, closed);
    expect(closed.documentEffects.find(effect => effect.document).document.body).toBe(body);
    expect(f.state.record.careContext.closeText).toBe(body);
    const reopened = change(f, 'reopenPlan', { reason: body, effectiveDateISO: day, documentId: 'fictional-long-reopen' });
    success(f, reopened);
    expect(reopened.documentEffects.find(effect => effect.document).document.body).toBe(body);
    expect(f.state.record.title).toBe('F'.repeat(240));
  });

  it('rejects a retrospective closure preceding already recorded clinical evidence', async () => {
    const f = await fixture();
    success(f, fact(f, ids.result, 'performance', { effectiveDateISO: '2026-11-04' }));
    const result = change(f, 'closePlan', { reason: 'other', text: 'Fikcyjna decyzja.', effectiveDateISO: '2026-11-03', documentId: 'fictional-early-close', confirmOpenWork: true });
    failed(result); expect(result.code).toBe('CARE_PLAN_PLAN_CHRONOLOGY');
    expect(f.state.record.careContext.status).toBe('active');
  });

  it.each([
    state => { state.source.definition.name = 'Podmieniona wersja źródłowa'; },
    state => { state.record.careContext.steps[0].requiredOutcome = 'performance'; },
    state => { state.record.careContext.stages[0].title = 'Podmieniony etap'; },
    state => { state.documentIds.reminders[ids.result] = 'fictional-replaced-reminder'; },
    state => { const intent = JSON.parse(state.operations[0].intentCanonical); intent.allowWrite = true; state.operations[0].intentCanonical = canonical(intent); }
  ])('rejects definition/source/identity replacement outside the explicit operation contract', async edit => {
    const f = await fixture(), altered = clone(f.state); edit(altered);
    expect(f.api.validateState(altered).ok).toBe(false);
    failed(f.api.prepareTransaction(altered, command(f, 'activateStage', { stageId: ids.first, effectiveDateISO: day }), clock));
  });

  it('rejects stale revision or wrong patient identity instead of overwriting current facts', async () => {
    const f = await fixture(); const stale = command(f, 'activateStage', { stageId: ids.first, effectiveDateISO: day });
    success(f, activate(f)); const before = JSON.stringify(f.state);
    failed(f.api.prepareTransaction(f.state, stale, clock));
    failed(f.api.prepareTransaction(f.state, command(f, 'setReminder', { stepId: ids.result, dateISO: null, time: null, patientId: 'fictional-other-patient' }), clock));
    failed(f.api.prepareTransaction(f.state, command(f, 'setReminder', { stepId: ids.result, dateISO: null, time: null, planId: 'fictional-other-plan' }), clock));
    expect(JSON.stringify(f.state)).toBe(before);
  });

  it('rejects a new operation at the ledger limit without trimming history and still accepts an exact retry', async () => {
    const f = await fixture(); success(f, activate(f));
    const reminder = change(f, 'setReminder', { stepId: ids.result, dateISO: '2026-12-01', time: '09:30' }); success(f, reminder);
    const state = clone(f.state), templateOperation = state.operations.at(-1), templateLog = state.record.careContext.log.at(-1);
    // Repeating the same explicit reminder with a fresh operation ID is a
    // supported no-op change. Extend that real transaction's ledger shape to
    // the production limit without O(n²) repeated VM copies during setup.
    let lastIntent = reminder.input;
    for (let revision = state.record.rev; revision < f.api.LIMITS.maxOperations; revision++) {
      lastIntent = { ...reminder.input, operationId: 'fictional-capacity-' + revision, expectedRevision: revision };
      state.operations.push({ ...clone(templateOperation), id: lastIntent.operationId, intentCanonical: canonical(lastIntent),
        fromRevision: revision, toRevision: revision + 1 });
      state.record.careContext.log.push({ ...clone(templateLog), operationId: lastIntent.operationId });
    }
    state.record.rev = f.api.LIMITS.maxOperations;
    state.record.careContext.steps.find(step => step.id === ids.result).reminderSchedule.overrideOperationId = lastIntent.operationId;
    expect(f.api.validateState(state).ok).toBe(true);
    const before = JSON.stringify(state);
    const next = { ...lastIntent, operationId: 'fictional-after-capacity', expectedRevision: state.record.rev, dateISO: '2026-12-02' };
    const rejected = f.api.prepareTransaction(state, next, clock);
    failed(rejected); expect(rejected.code).toBe('CARE_PLAN_OPERATION_LIMIT');
    expect(JSON.stringify(state)).toBe(before); expect(state.operations).toHaveLength(f.api.LIMITS.maxOperations);
    const retry = f.api.prepareTransaction(state, lastIntent, clock);
    success(f, retry); expect(retry.reused).toBe(true); expect(retry.state).toEqual(state);
    expect(retry.documentEffects).toEqual([]); expect(retry.readDependencies).toEqual([]);
  });

  it('freezes all proposed state and effects while leaving caller input detached and unchanged', async () => {
    const f = await fixture(); const before = JSON.stringify(f.command);
    expect(Object.isFrozen(f.created.state)).toBe(true); expect(Object.isFrozen(f.created.state.source.definition.steps[0])).toBe(true);
    expect(Object.isFrozen(f.created.state.record.careContext.stages[0].control)).toBe(true);
    expect(Object.isFrozen(f.created.state.operations)).toBe(true);
    expect(() => { f.created.state.record.title = 'Fikcyjna niedozwolona mutacja'; }).toThrow(TypeError);
    f.command.draft.definition.name = 'Fikcyjna późniejsza edycja robocza';
    expect(f.state.record.title).toBe('Fikcyjny plan etapowy');
    expect(JSON.stringify(f.command)).not.toBe(before); expect(f.forbidden).not.toHaveBeenCalled();
  });

  it.each([
    cmd => { cmd.allowWrite = true; }, cmd => { cmd.expectedRevision = 0; }, cmd => { cmd.patientId = ''; },
    cmd => { cmd.documentIds.reminders[ids.result] = cmd.planId; }, cmd => { delete cmd.documentIds.reminders[ids.result]; },
    cmd => { cmd.documentIds.reminders.extra = 'fictional-extra-reminder'; },
    cmd => { cmd.documentIds.reminders[ids.decision] = cmd.documentIds.reminders[ids.result]; },
    cmd => { cmd.draft.definition.steps[0].id = 'source-result'; },
    cmd => { cmd.draft.definition.stages[0].stepIds = []; }, cmd => { cmd.draft.source.revisionNumber = 0; }
  ])('rejects widened or inconsistent creation without any proposed patient documents', async edit => {
    const f = await fixture({ edit: cmd => { cmd.draft.source = clone(cmd.draft.source); edit(cmd); }, expectFailure: true });
    failed(f.created);
  });

  it.each([
    extra => { extra.effectiveDateISO = '2026-02-30'; }, extra => { extra.kind = 'automaticInterpretation'; },
    extra => { extra.evidence.sourceRecordRevAtCapture = -1; }, extra => { extra.evidence.patientId = 'fictional-other-patient'; },
    extra => { extra.document = { id: 'fictional-new-document', title: 'Fikcyjny dokument', body: 'Fikcyjna treść.' }; },
    extra => { delete extra.evidence; }, extra => { extra.factId = ids.result; }, extra => { extra.stepId = 'fictional-unknown-step'; }
  ])('rejects ambiguous or invalid factual commands atomically', async edit => {
    const f = await fixture(); success(f, activate(f));
    const extra = { stepId: ids.result, factId: 'fictional-invalid-fact', kind: 'resultReceipt', effectiveDateISO: day,
      evidence: { noteId: 'fictional-evidence', sourceRecordRevAtCapture: 1 } };
    edit(extra); failed(change(f, 'recordFact', extra)); expect(f.state.record.careContext.facts).toEqual([]);
  });

  it.each([
    { recordedAtISO: '2026-11-08T25:00:00.000Z' }, { recordedLocalDateISO: '2026-02-30' },
    { recordedAtISO: '2026-11-08T12:00:00+01:00' }, { originTimeZone: '' }, { allowFutureFacts: true }
  ])('rejects an invalid or widened supplied clock', async extra => {
    const f = await fixture();
    failed(change(f, 'activateStage', { stageId: ids.first, effectiveDateISO: day }, { ...clock, ...extra }));
    expect(stage(f).controlState).toBe('planned');
  });

  it.each([null, 'untrusted error', { message: 'untrusted text must not become a code' }, Object.defineProperty({}, 'message', { get() { throw new Error('Do not inspect thrown getters'); } })])('contains hostile non-JSON input without reading arbitrary thrown errors', async thrown => {
    const f = await fixture(); const evil = new Proxy({}, { getPrototypeOf() { throw thrown; } });
    let result; expect(() => { result = f.api.prepareTransaction(evil, command(f, 'activateStage', { stageId: ids.first, effectiveDateISO: day }), clock); }).not.toThrow();
    failed(result); expect(result.code).not.toContain('untrusted');
  });

  it('does not invoke input accessors or accept legacy state and authority claims', async () => {
    const f = await fixture(); const getter = vi.fn(() => { throw new Error('Input getter executed'); });
    const input = command(f, 'activateStage', { stageId: ids.first, effectiveDateISO: day });
    Object.defineProperty(input, 'effectiveDateISO', { get: getter, enumerable: true });
    failed(f.api.prepareTransaction(f.state, input, clock)); expect(getter).not.toHaveBeenCalled();
    const forged = clone(f.state); forged.writerAvailable = true;
    failed(f.api.prepareTransaction(forged, command(f, 'activateStage', { stageId: ids.first, effectiveDateISO: day }), clock));
    const legacy = clone(f.state); legacy.record.careContext.version = 1;
    failed(f.api.prepareTransaction(legacy, command(f, 'activateStage', { stageId: ids.first, effectiveDateISO: day }), clock));
  });
});
