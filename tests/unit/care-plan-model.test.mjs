import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
function api() { const win = {}; loadBrowserScript('vilda_care_plan_model.js', win); return win.VildaCarePlanModel; }
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function audit(operationId, date = '2026-10-30') {
  return { operationId, effectiveDateISO: date, recordedAtISO: date + 'T10:00:00.000Z', recordedLocalDateISO: date, originTimeZone: 'Europe/Warsaw' };
}
function record(context) {
  return { id: 'fictional-plan', patientId: 'fictional-patient', title: 'Fikcyjny plan', category: 'care-plan', rev: 7, careContext: context };
}
function context() {
  return { version: 2, role: 'plan', status: 'active', goal: 'Wyłącznie fikcyjny przykład.', stageOrder: ['stage-a', 'stage-b'],
    stages: ['a', 'b'].map(key => ({ id: 'stage-' + key, kind: 'regular', title: 'Fikcyjny etap ' + key, definitionOperationId: 'stage-definition-' + key,
      stepIds: ['step-' + key], control: { state: 'planned', activation: null, review: null } })),
    steps: ['a', 'b'].map(key => ({ id: 'step-' + key, stageId: 'stage-' + key, title: 'Fikcyjny krok ' + key, taskKind: 'Badanie', instruction: '',
      definitionOperationId: 'step-definition-' + key, requiredOutcome: 'resultReceipt', reminderRule: { kind: 'none' }, reminderSchedule: null, omission: null })),
    facts: [], factCorrections: [], associations: [], log: [] };
}
function fact(kind, extra = {}) {
  return { id: 'fact-' + kind, stepId: 'step-a', kind, ...audit('operation-' + kind), evidence: { noteId: 'original-' + kind, sourceRecordRevAtCapture: 3 }, ...extra };
}
function association(kind, extra = {}) {
  return { id: 'association-' + kind, stepId: 'step-a', kind, noteId: 'original-' + kind, sourceRecordRevAtCapture: 3,
    operationId: 'operation-association-' + kind, recordedAtISO: '2026-10-30T10:00:00.000Z', ...extra };
}
function activate(value, index = 0) { value.stages[index].control = { state: 'active', activation: audit('activation-' + index), review: null }; return value; }
function review(value, index = 0) {
  const stage = value.stages[index];
  const ids = new Set(stage.stepIds);
  const basis = [stage.definitionOperationId, stage.control.activation.operationId,
    ...value.steps.filter(step => ids.has(step.id)).map(step => step.definitionOperationId),
    ...value.facts.filter(item => ids.has(item.stepId)).map(item => item.operationId),
    ...value.associations.filter(item => ids.has(item.stepId)).map(item => item.operationId)];
  stage.control.state = 'reviewed'; stage.control.review = { ...audit('review-' + index), reviewBasis: basis };
  return value;
}
function view(value, options = { todayLocalDateISO: '2026-10-31' }) { const model = api(); return model.projectCarePlan(model.decodeCarePlanRecord(record(value)), options); }

describe('care-plan module stays pure and cannot grant a format-2 write capability', () => {
  it('registers without reading DOM, storage, timers, network or a clock', () => {
    const win = {};
    for (const key of ['document', 'localStorage', 'sessionStorage', 'indexedDB', 'fetch', 'setTimeout', 'Date', 'crypto']) {
      Object.defineProperty(win, key, { get() { throw new Error('Unexpected dependency: ' + key); } });
    }
    loadBrowserScript('vilda_care_plan_model.js', win);
    const model = win.VildaCarePlanModel;
    expect(model.calculateStageReminderDate('2026-01-31', 2, 'month')).toEqual({ ok: true, dateISO: '2026-03-31', code: null });
    expect(model.decodeCarePlanRecord(record(context())).kind).toBe('v2');
    expect(model.getWriteCapability()).toEqual({ available: false, code: 'CARE_V2_WRITER_DISABLED', formatVersion: 2 });
  });

  it('does not trust a caller flag, an epoch, a health response or a forged capability', () => {
    const model = api(), proof = { available: true, writeEpoch: 3, bootstrapReady: true, modeSupported: true, localFenceProof: true };
    expect(model.getWriteCapability(proof)).toMatchObject({ available: false });
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.getWriteCapability())).toBe(true);
    expect(() => { model.getWriteCapability().available = true; }).toThrow();
    const projected = model.projectCarePlan({ ...model.decodeCarePlanRecord(record(context())), writeCapability: proof });
    expect(projected).toMatchObject({ readOnly: true, provenanceVerified: false, writeCapability: { available: false } });
    expect(projected.stages[0].steps[0].capabilities).toEqual({ canLinkResult: false, canLinkEvent: false, canRecordFact: false, canOmit: false });
  });
});

describe('V1 is an exact detached read, never an inferred migration', () => {
  function legacy() {
    return { version: 1, role: 'plan', status: 'closed', goal: 'Fikcyjne ustalenia.', closedAtISO: '2026-10-30T11:00:00.000Z',
      steps: [{ id: 'parallel-a', title: 'Fikcyjne badanie', state: 'done', completedDateISO: null, reminderDateISO: '2027-03-31', reminderTime: '09:15', eventDateISO: '2027-04-04', eventTime: '13:00', resultNoteId: null },
        { id: 'parallel-b', title: 'Fikcyjne badanie', state: 'waiting', reminderDateISO: '2026-11-03', reminderTime: '15:40', eventDateISO: null, eventTime: null }],
      log: [{ dateISO: '2026-10-30', text: 'Fikcyjna dawna historia.', noteId: 'original-history', resolution: { version: 1, technicalProof: ['retained'] } }],
      operations: [{ id: 'operation-old', fingerprint: 'unchanged' }], causality: { version: 1, nodes: [], roots: ['root-exact'] }, unknownFutureExtension: { retained: [true, 12, null] } };
  }

  it('preserves all original fields and their serialized form across repeated decode/project/navigation reads', () => {
    const model = api(), original = record(legacy()), serialized = JSON.stringify(original); freeze(original);
    for (let index = 0; index < 4; index++) {
      const decoded = model.decodeCarePlanRecord(original), projected = model.projectCarePlan(decoded, { todayLocalDateISO: '2026-10-31' });
      expect(decoded.kind).toBe('v1'); expect(JSON.stringify(decoded.rawContext)).toBe(JSON.stringify(original.careContext));
      expect(decoded.model).toEqual(original.careContext);
      expect(projected.stages[0]).toMatchObject({ viewKey: 'legacy:fictional-plan', kind: 'legacy', control: null, legacyState: 'unclassified' });
      expect(projected.stages[0].legacyContext).toEqual(original.careContext);
      expect(projected.stages[0].steps.map(step => step.legacy)).toEqual(original.careContext.steps);
      expect(projected.facts).toEqual([]); expect(projected.nextAction).toBeNull();
      expect(JSON.stringify(original)).toBe(serialized);
    }
  });

  it('keeps similarly named parallel steps separate and ambiguous done provenance unknown', () => {
    const projected = view(legacy()), stage = projected.stages[0];
    expect(stage.steps.map(step => step.id)).toEqual(['parallel-a', 'parallel-b']);
    expect(stage.steps[0].legacyCompletion).toEqual({ state: 'done', provenance: 'unknown', storedSource: null });
    expect(stage.steps[0].facts).toEqual([]);
    expect(stage.steps[0].legacy.completedDateISO).toBeNull();
    expect(stage.steps[1].legacy.reminderTime).toBe('15:40');
    expect(stage).not.toHaveProperty('id'); expect(stage).not.toHaveProperty('activatedDateISO');
  });

  it('shows a raw stored source without manufacturing a modern fact or receipt date', () => {
    const value = legacy(); value.steps[0].completionSource = 'result'; value.steps[0].resultNoteId = 'original-result';
    const step = view(value).stages[0].steps[0];
    expect(step.legacyCompletion).toEqual({ state: 'done', provenance: 'unknown', storedSource: 'result' });
    expect(step.facts).toEqual([]); expect(step.legacy.resultNoteId).toBe('original-result');
  });

  it('never shares mutable nested references with a caller or a previous projection', () => {
    const model = api(), input = record(legacy()), decoded = model.decodeCarePlanRecord(input), first = model.projectCarePlan(decoded);
    first.rawContext.log[0].text = 'Changed view only'; first.stages[0].steps[0].legacy.title = 'Changed view only';
    const second = model.projectCarePlan(decoded);
    expect(input.careContext.log[0].text).toBe('Fikcyjna dawna historia.');
    expect(second.stages[0].steps[0].legacy.title).toBe('Fikcyjne badanie');
    expect(decoded.model).toEqual(input.careContext);
  });

  it.each([undefined, 0])('preserves legal V1 revision semantics through decode and project: %s', rev => {
    const model = api(), note = record(legacy());
    if (rev === undefined) delete note.rev; else note.rev = rev;
    const decoded = model.decodeCarePlanRecord(note), projected = model.projectCarePlan(decoded);
    expect(decoded.kind).toBe('v1'); expect(projected.kind).toBe('v1');
    if (rev === undefined) { expect(decoded.record).not.toHaveProperty('rev'); expect(projected.record).not.toHaveProperty('rev'); }
    else expect(projected.record.rev).toBe(0);
  });

  it('reads legal legacy text beyond the former 4 MiB clone limit without treating it as a new format', () => {
    const value = legacy(); value.log = Array.from({ length: 260 }, (_, index) => ({ dateISO: '2026-10-30', text: String(index) + 'F'.repeat(20000) }));
    const model = api(), decoded = model.decodeCarePlanRecord(record(value));
    expect(JSON.stringify(value).length).toBeGreaterThan(4 * 1024 * 1024);
    expect(decoded.kind).toBe('v1'); expect(model.projectCarePlan(decoded).stages[0].legacyContext.log).toEqual(value.log);
  });

  it('reads legal durable legacy graph and commitment counts beyond 100000 JSON nodes', () => {
    const value = legacy();
    const root = 'care-root-' + 'a'.repeat(64), keys = ['metadata', 'status', 'decision', 'step:parallel-a', 'step:parallel-b'];
    value.causality = { version: 1, roots: ['a'.repeat(64)], nodes: [{ id: root, parents: [] }, ...Array.from({ length: 16383 }, (_, index) => ({ id: 'operation-' + index, parents: [index ? 'operation-' + (index - 1) : root] }))],
      legacyObservedIds: [], fingerprints: [], writes: keys.map(key => ({ key, id: root })), alternatives: [],
      commitments: keys.map(key => ({ key, id: root, digest: 'a'.repeat(64) })).concat(Array.from({ length: 32000 }, (_, index) => ({ id: 'operation-' + index % 16383, key: 'log', dateISO: '2026-10-30', digest: index.toString(16).padStart(64, '0') }))),
      seenOperationIds: Array.from({ length: 16383 }, (_, index) => 'operation-' + index).sort() };
    const model = api(), decoded = model.decodeCarePlanRecord(record(value));
    const serialized = JSON.stringify(value.causality);
    expect(serialized.length).toBeLessThan(16 * 1024 * 1024);
    expect(decoded.kind).toBe('v1'); expect(JSON.stringify(model.projectCarePlan(decoded).stages[0].legacyContext.causality)).toBe(serialized);
  });
});

describe('strict version dispatch retains unsupported JSON for an explicit read-only problem', () => {
  it.each([null, undefined])('keeps absent/detached careContext %s ordinary', value => {
    const note = { id: 'fictional-ordinary', patientId: 'fictional-patient' }; if (value === null) note.careContext = null;
    const model = api(), decoded = model.decodeCarePlanRecord(note);
    expect(decoded).toMatchObject({ kind: 'none', model: null, rawContext: null });
    expect(model.projectCarePlan(decoded)).toMatchObject({ kind: 'none', issues: [], nextAction: null });
  });

  it.each([null, undefined])('keeps a care-plan aggregate with missing/null context %s explicitly unreadable through projection', value => {
    const note = record(value); if (value === undefined) delete note.careContext;
    const model = api(), decoded = model.decodeCarePlanRecord(note), expected = { code: 'CARE_MODEL_CONTEXT_MISSING', path: 'careContext' };
    expect(decoded).toMatchObject({ kind: 'unsupported', record: { category: 'care-plan' }, rawContext: null, issues: [expected] });
    expect(model.projectCarePlan(decoded)).toMatchObject({ kind: 'unsupported', stages: null, issues: [expected], nextAction: { type: 'unsupportedFormat' } });
  });

  it('preserves an explicit ordinary category instead of reconstructing it as a care plan', () => {
    const model = api(), note = { id: 'fictional-ordinary', patientId: 'fictional-patient', title: 'Fikcyjna notatka', category: 'observation', careContext: null };
    const projected = model.projectCarePlan(model.decodeCarePlanRecord(note));
    expect(projected).toMatchObject({ kind: 'none', record: { category: 'observation' }, issues: [], nextAction: null });
  });

  it.each(['step', 'calendar', 'result', 'note', 'decision'])('does not turn a valid V1 %s helper into a plan', role => {
    const categories = { step: 'reminder-task', calendar: 'followup', result: 'wynik-badania', note: 'observation', decision: 'reminder-task' };
    const decoded = api().decodeCarePlanRecord({ ...record({ version: 1, role, planId: 'parent-plan' }), category: categories[role] });
    expect(decoded.kind).toBe('none'); expect(api().projectCarePlan(decoded).kind).toBe('none');
  });

  it.each(['step', 'calendar', 'result', 'note', 'decision'])('keeps a care-plan aggregate with V1 child role %s explicitly malformed', role => {
    const model = api(), decoded = model.decodeCarePlanRecord(record({ version: 1, role, planId: 'parent-plan' }));
    expect(decoded.kind).toBe('unsupported');
    expect(decoded.issues).toContainEqual({ code: 'CARE_MODEL_RECORD_INVALID', path: 'record.category' });
    expect(model.projectCarePlan(decoded)).toMatchObject({ kind: 'unsupported', stages: null, nextAction: { type: 'unsupportedFormat' } });
  });

  it.each([undefined, '', 'invalid/parent'])('does not label malformed protected helpers ordinary: %s', planId => {
    const context = { version: 1, role: 'calendar' }; if (planId !== undefined) context.planId = planId;
    const decoded = api().decodeCarePlanRecord({ ...record(context), category: 'followup' });
    expect(decoded.kind).toBe('unsupported'); expect(decoded.rawContext).toEqual(context);
    expect(decoded.issues).toContainEqual({ code: 'CARE_MODEL_LEGACY_INVALID', path: 'careContext.planId' });
  });

  it.each([3, '2', 0, null])('retains unknown version %s without a fallback to V1', version => {
    const model = api(), input = record({ version, role: 'plan', future: { full: ['fictional', 7] } }), decoded = model.decodeCarePlanRecord(input);
    expect(decoded.kind).toBe('unsupported'); expect(decoded.rawContext).toEqual(input.careContext); expect(decoded.model).toBeNull();
    const projected = model.projectCarePlan(decoded);
    expect(projected).toMatchObject({ kind: 'unsupported', readOnly: true, provenanceVerified: false, stages: null, nextAction: { type: 'unsupportedFormat' } });
    expect(projected.rawContext).toEqual(input.careContext);
  });

  it.each([
    ['corrections', value => { value.factCorrections.push({ id: 'future-correction', retained: 'not interpreted' }); }, 'CARE_MODEL_CORRECTIONS_UNSUPPORTED'],
    ['persisted legacy stage', value => { value.stages[0].kind = 'legacy'; }, 'CARE_MODEL_LEGACY_ADAPTER_UNSUPPORTED'],
    ['unknown field', value => { value.steps[0].inventedClinicalMeaning = true; }, 'CARE_MODEL_UNSUPPORTED_FIELD'],
    ['unknown required outcome', value => { value.steps[0].requiredOutcome = 'result-implies-performance'; }, 'CARE_MODEL_STEP_INVALID'],
    ['missing stage control', value => { delete value.stages[0].control.activation; }, 'CARE_MODEL_CONTROL_INVALID'],
    ['misplaced step', value => { value.steps[0].stageId = 'stage-b'; }, 'CARE_MODEL_MEMBERSHIP_INVALID'],
    ['duplicate identity', value => { value.steps[1].id = value.steps[0].id; }, 'CARE_MODEL_ID_INVALID'],
    ['missing stage order entry', value => { value.stageOrder.pop(); }, 'CARE_MODEL_STAGE_ORDER_INVALID'],
    ['empty stage', value => { value.stages[0].stepIds = []; }, 'CARE_MODEL_EMPTY_STAGE'],
    ['closed without explicit metadata', value => { value.status = 'closed'; }, 'CARE_MODEL_CLOSE_INVALID'],
    ['review before activation', value => { activate(value); review(value); value.stages[0].control.review.effectiveDateISO = '2026-10-29'; }, 'CARE_MODEL_REVIEW_BEFORE_ACTIVATION'],
    ['untyped review basis', value => { activate(value); review(value); value.stages[0].control.review.reviewBasis = [{ id: 'activation-0' }]; }, 'CARE_MODEL_AUDIT_INVALID'],
    ['missing original revision', value => { value.facts.push(fact('resultReceipt', { evidence: { noteId: 'original-result' } })); }, 'CARE_MODEL_EVIDENCE_INVALID'],
    ['appointment rule masquerading as anchor', value => { value.steps[0].reminderRule = { kind: 'result-offset', amount: 3, unit: 'day' }; }, 'CARE_MODEL_RULE_INVALID'],
    ['materialized reminder in planned stage', value => { value.steps[0].reminderSchedule = { dateISO: '2027-01-01', origin: 'manual', overrideOperationId: 'override' }; }, 'CARE_MODEL_SCHEDULE_BEFORE_ACTIVATION'],
  ])('makes %s explicit rather than dropping/defaulting it', (_name, change, code) => {
    const value = context(); change(value); const input = record(value), model = api(), before = JSON.stringify(input), decoded = model.decodeCarePlanRecord(input);
    expect(decoded.kind).toBe('unsupported'); expect(decoded.issues.some(item => item.code === code)).toBe(true);
    expect(decoded.rawContext).toEqual(value); expect(JSON.stringify(input)).toBe(before);
    expect(model.projectCarePlan(decoded).nextAction.type).toBe('unsupportedFormat');
  });

  it.each([NaN, Infinity, undefined, () => {}, new Date(), new Map()])('rejects non-JSON content without silently erasing it: %s', invalid => {
    const value = context(); value.goal = invalid;
    const model = api(), decoded = model.decodeCarePlanRecord(record(value));
    expect(decoded.kind).toBe('unsupported'); expect(decoded.rawContext).toBeNull();
    expect(model.projectCarePlan(decoded).kind).toBe('unsupported');
  });

  it('bounds depth, cycles and accessors without invoking imported getters', () => {
    const model = api(), value = context(), getter = vi.fn(() => 'unexpected');
    Object.defineProperty(value, 'payload', { enumerable: true, get: getter });
    expect(model.decodeCarePlanRecord(record(value)).kind).toBe('unsupported'); expect(getter).not.toHaveBeenCalled();
    const cycle = context(); cycle.loop = cycle; expect(model.decodeCarePlanRecord(record(cycle)).kind).toBe('unsupported');
    const deep = context(); let target = deep; for (let index = 0; index < 50; index++) target = target.next = {};
    const limited = model.decodeCarePlanRecord(record(deep));
    expect(limited).toMatchObject({ kind: 'limited', rawContext: null, model: null, issues: [{ code: 'CARE_MODEL_JSON_LIMIT', path: 'careContext' }] });
    expect(model.projectCarePlan(limited)).toMatchObject({ kind: 'limited', stages: null, nextAction: { type: 'viewLimit' } });
  });

  it('preserves an own __proto__ JSON key without changing any object prototype', () => {
    const raw = JSON.parse('{"version":3,"role":"plan","__proto__":{"polluted":true}}');
    const decoded = api().decodeCarePlanRecord(record(raw));
    expect(Object.prototype.hasOwnProperty.call(decoded.rawContext, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(decoded.rawContext)).toBe(Object.prototype);
    expect({}.polluted).toBeUndefined(); expect(JSON.stringify(decoded.rawContext)).toBe(JSON.stringify(raw));
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '7', null])('does not normalize an invalid provided record revision %s', rev => {
    const decoded = api().decodeCarePlanRecord({ ...record(context()), rev });
    expect(decoded.kind).toBe('unsupported'); expect(decoded.issues).toContainEqual({ code: 'CARE_MODEL_RECORD_INVALID', path: 'record.rev' });
  });

  it('accepts a pure record fixture with an omitted revision without inventing one', () => {
    const value = record(context()); delete value.rev;
    const model = api(), decoded = model.decodeCarePlanRecord(value); expect(decoded.kind).toBe('v2'); expect(decoded.record).not.toHaveProperty('rev');
    expect(model.projectCarePlan(decoded).kind).toBe('v2');
  });
});

describe('dormant V2 workflow views separate control from facts', () => {
  it('keeps a planned future stage planned after linking a result and booking in either order', () => {
    const a = context(); a.facts.push(fact('resultReceipt')); a.associations.push(association('result'), association('event'));
    const b = clone(a); b.associations.reverse();
    const before = JSON.stringify(a); freeze(a);
    for (const value of [a, b]) {
      const projected = view(value), stage = projected.stages[0], step = stage.steps[0];
      expect(stage.control).toEqual({ state: 'planned', activation: null, review: null });
      expect(stage.readyForReview).toBe(false); expect(step.progress).toBe('resolved');
      expect(step.facts.map(item => item.kind)).toEqual(['resultReceipt']);
      expect(step.associations.map(item => item.noteId).sort()).toEqual(['original-event', 'original-result']);
      expect(step.workflowEligibility).toMatchObject({ canLinkResult: true, canLinkEvent: true });
      expect(step.reminderSchedule).toBeNull(); expect(projected.nextAction.type).toBe('startStage');
      expect(projected.attentionItems.map(item => item.type)).toEqual(['startStage']);
    }
    expect(JSON.stringify(a)).toBe(before);
  });

  it('does not invent receipt from a result association, performance from receipt, or a fact from a calendar event', () => {
    const value = activate(context()); value.associations.push(association('result'), association('event'));
    expect(view(value).stages[0].steps[0].progress).toBe('pending');
    value.facts.push(fact('performance')); expect(view(value).stages[0].steps[0].progress).toBe('waiting');
    value.facts = [fact('resultReceipt')];
    const projected = view(value); expect(projected.stages[0].steps[0].progress).toBe('resolved');
    expect(projected.facts.map(item => item.kind)).toEqual(['resultReceipt']); expect(projected.nextAction.type).toBe('reviewStage');
    expect(projected.stages[0].controlState).toBe('active'); expect(projected.stages[1].controlState).toBe('planned');
  });

  it('keeps an active undated task visible without overdue while future-stage tasks stay out', () => {
    const projected = view(activate(context()));
    expect(projected.attentionItems).toEqual([{ key: 'fictional-plan:work:stage-a:step-a', type: 'work', planId: 'fictional-plan', stageId: 'stage-a', stepId: 'step-a', dueDateISO: null, overdue: false }]);
    expect(projected.stages[1].steps[0].progress).toBe('pending');
  });

  it.each([['2026-10-29', true, 1], ['2026-10-31', false, 1], ['2026-11-01', false, 0]])('uses explicit today only for due presentation: %s', (due, overdue, count) => {
    const value = activate(context()); value.steps[0].reminderSchedule = { dateISO: due, origin: 'manual', overrideOperationId: 'manual-snooze' };
    const projected = view(value); expect(projected.attentionItems).toHaveLength(count);
    if (count) expect(projected.attentionItems[0].overdue).toBe(overdue);
    expect(projected.stages[0].steps[0].reminderSchedule).toEqual(value.steps[0].reminderSchedule);
  });

  it('does not compare already recorded facts to the receiving device current day', () => {
    const value = context(); value.facts.push(fact('resultReceipt', { effectiveDateISO: '2026-11-01', recordedLocalDateISO: '2026-11-01', recordedAtISO: '2026-10-31T11:00:00.000Z', originTimeZone: 'Pacific/Kiritimati' }));
    const projected = view(value, { todayLocalDateISO: '2026-10-30' });
    expect(projected.kind).toBe('v2'); expect(projected.stages[0].steps[0].progress).toBe('resolved');
    expect(projected.facts[0].effectiveDateISO).toBe('2026-11-01');
  });

  it('allows a captured original legacy revision zero without relaxing V2 plan revisions', () => {
    const value = context(); value.facts.push(fact('resultReceipt', { evidence: { noteId: 'original-legacy-result', sourceRecordRevAtCapture: 0 } }));
    value.associations.push(association('event', { sourceRecordRevAtCapture: 0 }));
    const projected = view(value); expect(projected.kind).toBe('v2');
    expect(projected.facts[0].evidence.sourceRecordRevAtCapture).toBe(0);
    expect(projected.stages[0].steps[0].progress).toBe('resolved');
    expect(api().decodeCarePlanRecord({ ...record(value), rev: 0 }).kind).toBe('unsupported');
  });

  it('requires manual review, then manual start, then an explicit final plan decision', () => {
    const value = activate(context()); value.facts.push(fact('resultReceipt'));
    expect(view(value).nextAction.type).toBe('reviewStage');
    review(value); expect(view(value).nextAction).toMatchObject({ type: 'startStage', stageId: 'stage-b' });
    expect(view(value).stages[1].control.activation).toBeNull();
    activate(value, 1); value.facts.push(fact('resultReceipt', { id: 'fact-stage-b', stepId: 'step-b', operationId: 'fact-operation-b', evidence: { noteId: 'original-b', sourceRecordRevAtCapture: 1 } }));
    expect(view(value).nextAction.type).toBe('reviewStage'); review(value, 1);
    const final = view(value); expect(final.nextAction.type).toBe('decidePlan'); expect(final.rawContext.status).toBe('active');
    expect(final.facts.every(item => item.kind === 'resultReceipt')).toBe(true);
  });

  it('retains earlier review and later active stage when its observed basis becomes stale', () => {
    const value = activate(context()); value.facts.push(fact('resultReceipt')); review(value); activate(value, 1);
    const oldReview = clone(value.stages[0].control.review);
    value.associations.push(association('document'));
    const projected = view(value);
    expect(projected.stages[0]).toMatchObject({ controlState: 'reviewed', reviewStale: true });
    expect(projected.stages[0].control.review).toEqual(oldReview); expect(projected.stages[1].controlState).toBe('active');
    expect(projected.nextAction.type).toBe('reviewChangedStage');
  });

  it.each(['two active stages', 'wrong order', 'different receipts', 'receipt before performance', 'omission and required fact', 'sync review'])('retains evidence and blocks conflicting workflow: %s', kind => {
    const value = activate(context());
    if (kind === 'two active stages') activate(value, 1);
    if (kind === 'wrong order') { value.stages[0].control = { state: 'planned', activation: null, review: null }; activate(value, 1); }
    if (kind === 'different receipts') value.facts.push(fact('resultReceipt'), fact('resultReceipt', { id: 'different-receipt', operationId: 'different-operation', evidence: { noteId: 'different-original', sourceRecordRevAtCapture: 2 } }));
    if (kind === 'receipt before performance') value.facts.push(fact('performance'), fact('resultReceipt', { ...audit('receipt-before', '2026-10-29') }));
    if (kind === 'omission and required fact') { value.facts.push(fact('resultReceipt')); value.steps[0].omission = { ...audit('omission'), reason: 'Fikcyjne uzasadnienie.' }; }
    if (kind === 'sync review') value.syncNeedsReview = true;
    const projected = view(value); expect(projected.kind).toBe('v2'); expect(projected.nextAction.type).toBe('resolveConflict');
    expect(projected.facts).toEqual(value.facts);
    expect(projected.stages.every(stage => stage.steps.every(step => !step.workflowEligibility.canLinkEvent))).toBe(true);
  });

  it('preserves performance when the remaining receipt requirement is explicitly omitted', () => {
    const value = activate(context()); value.facts.push(fact('performance')); value.steps[0].omission = { ...audit('omit-unneeded-receipt'), reason: 'Fikcyjny powód pominięcia wyniku.' };
    const projected = view(value); expect(projected.stages[0].steps[0].progress).toBe('omitted');
    expect(projected.facts.map(item => item.kind)).toEqual(['performance']); expect(projected.nextAction.type).toBe('reviewStage');
  });

  it('keeps closed plans readable without enabling facts/associations or starting an unfinished stage', () => {
    const value = activate(context()); Object.assign(value, { status: 'closed', closedAtISO: '2026-10-30T12:00:00.000Z', closeReason: 'Fikcyjny powód.', closeText: 'Fikcyjne ustalenia.' });
    const projected = view(value); expect(projected.nextAction).toBeNull(); expect(projected.attentionItems).toEqual([]);
    expect(projected.stages[0].steps[0].workflowEligibility.canLinkEvent).toBe(false);
    expect(projected.rawContext.status).toBe('closed');
  });
});

describe('calendar offsets are date-only and require an explicit activation anchor', () => {
  it.each([
    ['2026-01-31', 1, 'month', '2026-02-28'], ['2026-01-31', 2, 'month', '2026-03-31'],
    ['2028-01-31', 1, 'month', '2028-02-29'], ['2000-02-28', 1, 'day', '2000-02-29'],
    ['2100-02-28', 1, 'day', '2100-03-01'], ['2026-03-28', 1, 'day', '2026-03-29'],
    ['2026-10-24', 1, 'week', '2026-10-31'], ['2026-12-31', 1, 'day', '2027-01-01'],
    ['2026-10-31', 0, 'month', '2026-10-31'], ['2026-10-31', 1200, 'month', '2126-10-31'],
    ['2026-01-01', 1200, 'week', '2048-12-31'],
  ])('%s + %s %s = %s', (anchor, amount, unit, expected) => {
    expect(api().calculateStageReminderDate(anchor, amount, unit)).toEqual({ ok: true, dateISO: expected, code: null });
  });

  it('represents no timing without consulting or inventing an anchor', () => {
    expect(api().calculateStageReminderDate(null, 0, 'none')).toEqual({ ok: true, dateISO: null, code: null });
  });

  it.each([
    [null, 1, 'day', 'CARE_DATE_INVALID'], ['2026-02-30', 1, 'day', 'CARE_DATE_INVALID'], ['0000-01-01', 1, 'day', 'CARE_DATE_INVALID'],
    ['2026-10-31', '1', 'day', 'CARE_OFFSET_INVALID'], ['2026-10-31', -1, 'day', 'CARE_OFFSET_INVALID'], ['2026-10-31', 1.2, 'day', 'CARE_OFFSET_INVALID'],
    ['2026-10-31', 1201, 'day', 'CARE_OFFSET_INVALID'], ['2026-10-31', 1, 'result', 'CARE_OFFSET_INVALID'],
    ['2999-12-31', 1, 'day', 'CARE_DATE_OVERFLOW'], ['2999-12-31', 1, 'month', 'CARE_DATE_OVERFLOW'],
  ])('rejects invalid or overflowing date arithmetic %s/%s/%s', (anchor, amount, unit, code) => {
    expect(api().calculateStageReminderDate(anchor, amount, unit)).toEqual({ ok: false, dateISO: null, code });
  });
});

describe('V2 component canonicalization uses a separate explicit domain', () => {
  it('is deterministic without changing any V1 field or stripping an authored V2 field', () => {
    const model = api(), first = { z: ['unchanged-order', { b: 2, a: 1 }], a: 'fictional' }, second = { a: 'fictional', z: ['unchanged-order', { a: 1, b: 2 }] };
    const before = JSON.stringify(first), encoded = model.canonicalizeV2Component('step:fictional-step', first);
    expect(encoded).toBe(model.canonicalizeV2Component('step:fictional-step', second));
    expect(JSON.parse(encoded)).toEqual({ codec: 'care-plan-components', version: 2, key: 'step:fictional-step', value: first });
    expect(JSON.stringify(first)).toBe(before);
    expect(encoded).not.toBe(model.canonicalizeV2Component('fact:fictional-step', first));
    expect(encoded).not.toBe(model.canonicalizeV2Component('step:fictional-step', { ...first, extra: true }));
  });

  it('does not accept unversioned or unknown component namespaces', () => {
    expect(() => api().canonicalizeV2Component('legacy-sha', {})).toThrow('CARE_MODEL_COMPONENT_INVALID');
  });
});
