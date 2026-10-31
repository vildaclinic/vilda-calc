/* Read-only care-plan codecs and workflow views.
 * This module has no storage, clock, DOM, network or mutation API. A structural
 * view is not cryptographic verification. Format-2 writes stay unavailable until
 * the separately reviewed compatibility bridge can protect every write path.
 */
(function (root) {
  'use strict';
  if (!root) return;

  // V1 permits a 16 MiB causality section plus its clinical history. These are
  // reader resource limits, not a smaller replacement for its storage contract.
  const MAX_NODES = 1000000, MAX_TEXT_UNITS = 32 * 1024 * 1024, MAX_DEPTH = 48;
  const WRITE_CAPABILITY = Object.freeze({ available: false, code: 'CARE_V2_WRITER_DISABLED', formatVersion: 2 });
  const ID = /^[A-Za-z0-9_.-]{1,160}$/;
  const FACT_KINDS = ['performance', 'resultReceipt', 'decision'];
  const LEGACY_ROLES = ['plan', 'step', 'calendar', 'result', 'note', 'decision'];
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const identifier = value => typeof value === 'string' && ID.test(value);
  const text = (value, maximum, required) => typeof value === 'string' && value.length <= maximum && (!required || !!value.trim());

  // Copy JSON without invoking accessors, sharing caller objects or assigning a
  // magic __proto__ setter. Reject cycles/unsupported values instead of dropping
  // fields in a lossy JSON.stringify roundtrip.
  function copy(value) {
    const budget = { nodes: 0, text: 0 }, ancestors = new Set();
    function visit(item, depth) {
      if (++budget.nodes > MAX_NODES || depth > MAX_DEPTH) throw new Error('CARE_MODEL_JSON_LIMIT');
      if (item === null || typeof item === 'boolean') return item;
      if (typeof item === 'number' && Number.isFinite(item)) return item;
      if (typeof item === 'string') {
        budget.text += item.length;
        if (budget.text > MAX_TEXT_UNITS) throw new Error('CARE_MODEL_JSON_LIMIT');
        return item;
      }
      if (!item || typeof item !== 'object' || ancestors.has(item)) throw new Error('CARE_MODEL_INVALID_JSON');
      const prototype = Object.getPrototypeOf(item);
      if (!Array.isArray(item) && prototype !== null && Object.prototype.toString.call(item) !== '[object Object]') throw new Error('CARE_MODEL_INVALID_JSON');
      if (Reflect.ownKeys(item).some(key => typeof key !== 'string' || !Object.getOwnPropertyDescriptor(item, key).enumerable && !(Array.isArray(item) && key === 'length'))) throw new Error('CARE_MODEL_INVALID_JSON');
      if (Array.isArray(item) && (Object.keys(item).length !== item.length || Object.keys(item).some((key, index) => key !== String(index)))) throw new Error('CARE_MODEL_INVALID_JSON');
      ancestors.add(item);
      const result = Array.isArray(item) ? [] : {};
      for (const key of Object.keys(item)) {
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (!descriptor || !own(descriptor, 'value')) throw new Error('CARE_MODEL_INVALID_JSON');
        budget.text += key.length;
        if (budget.text > MAX_TEXT_UNITS) throw new Error('CARE_MODEL_JSON_LIMIT');
        Object.defineProperty(result, key, { value: visit(descriptor.value, depth + 1), enumerable: true, writable: true, configurable: true });
      }
      if (Array.isArray(item) && result.length !== item.length) throw new Error('CARE_MODEL_INVALID_JSON');
      ancestors.delete(item);
      return result;
    }
    return visit(value, 0);
  }

  function daysInMonth(year, month) {
    return [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  }
  function dateParts(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const parts = value.split('-').map(Number);
    return parts[0] >= 1900 && parts[0] <= 2999 && parts[1] >= 1 && parts[1] <= 12 && parts[2] >= 1 && parts[2] <= daysInMonth(parts[0], parts[1]) ? parts : null;
  }
  function instant(value) {
    if (typeof value !== 'string') return false;
    const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?Z$/.exec(value);
    return !!(match && dateParts(match[1]) && Number(match[2]) < 24 && Number(match[3]) < 60 && Number(match[4]) < 60);
  }
  function formatDate(parts) { return String(parts[0]).padStart(4, '0') + '-' + String(parts[1]).padStart(2, '0') + '-' + String(parts[2]).padStart(2, '0'); }
  function calculateStageReminderDate(activationDateISO, amount, unit) {
    const fail = code => ({ ok: false, dateISO: null, code });
    if (unit === 'none') return amount === 0 ? { ok: true, dateISO: null, code: null } : fail('CARE_OFFSET_INVALID');
    if (!Number.isInteger(amount) || amount < 0 || amount > 1200 || !['day', 'week', 'month'].includes(unit)) return fail('CARE_OFFSET_INVALID');
    const parts = dateParts(activationDateISO);
    if (!parts) return fail('CARE_DATE_INVALID');
    if (unit === 'month') {
      const target = parts[0] * 12 + parts[1] - 1 + amount;
      parts[0] = Math.floor(target / 12); parts[1] = target % 12 + 1;
      if (parts[0] > 2999) return fail('CARE_DATE_OVERFLOW');
      parts[2] = Math.min(parts[2], daysInMonth(parts[0], parts[1]));
    } else {
      let remaining = unit === 'week' ? amount * 7 : amount;
      while (remaining > 0) {
        const available = daysInMonth(parts[0], parts[1]) - parts[2];
        if (remaining <= available) { parts[2] += remaining; remaining = 0; }
        else {
          remaining -= available + 1; parts[2] = 1;
          if (++parts[1] > 12) { parts[1] = 1; parts[0]++; }
          if (parts[0] > 2999) return fail('CARE_DATE_OVERFLOW');
        }
      }
    }
    return { ok: true, dateISO: formatDate(parts), code: null };
  }

  function issue(issues, code, path) { if (issues.length < 128) issues.push({ code, path }); }
  function fields(value, allowed, path, issues) {
    if (!object(value)) { issue(issues, 'CARE_MODEL_OBJECT_REQUIRED', path); return false; }
    Object.keys(value).forEach(key => { if (!allowed.includes(key)) issue(issues, 'CARE_MODEL_UNSUPPORTED_FIELD', path + '.' + key); });
    return true;
  }
  function collection(value, path, issues, maximum) {
    if (!Array.isArray(value) || value.length > maximum) { issue(issues, 'CARE_MODEL_COLLECTION_INVALID', path); return []; }
    return value;
  }
  function uniqueIds(values, path, issues) {
    const ids = new Set();
    values.forEach((value, index) => {
      const id = object(value) ? value.id : value;
      if (!identifier(id) || ids.has(id)) issue(issues, 'CARE_MODEL_ID_INVALID', path + '[' + index + ']');
      ids.add(id);
    });
    return ids;
  }
  function audit(value, path, issues, review) {
    const allowed = ['operationId', 'effectiveDateISO', 'recordedAtISO', 'recordedLocalDateISO', 'originTimeZone'];
    if (review) allowed.push('reviewBasis');
    if (!fields(value, allowed, path, issues)) return;
    if (!identifier(value.operationId) || !dateParts(value.effectiveDateISO) || !instant(value.recordedAtISO) || !dateParts(value.recordedLocalDateISO)) issue(issues, 'CARE_MODEL_AUDIT_INVALID', path);
    if (dateParts(value.effectiveDateISO) && dateParts(value.recordedLocalDateISO) && value.effectiveDateISO > value.recordedLocalDateISO) issue(issues, 'CARE_MODEL_FACT_CHRONOLOGY', path);
    if (own(value, 'originTimeZone') && !text(value.originTimeZone, 100, true)) issue(issues, 'CARE_MODEL_AUDIT_INVALID', path + '.originTimeZone');
    if (review) {
      const basis = collection(value.reviewBasis, path + '.reviewBasis', issues, 20000);
      uniqueIds(basis, path + '.reviewBasis', issues);
      if (basis.some(id => !identifier(id))) issue(issues, 'CARE_MODEL_AUDIT_INVALID', path + '.reviewBasis');
    }
  }
  function evidence(value, path, issues) {
    if (!fields(value, ['noteId', 'sourceRecordRevAtCapture'], path, issues)) return;
    if (!identifier(value.noteId) || !Number.isSafeInteger(value.sourceRecordRevAtCapture) || value.sourceRecordRevAtCapture < 0) issue(issues, 'CARE_MODEL_EVIDENCE_INVALID', path);
  }
  function reminderRule(value, path, issues) {
    if (!object(value)) { issue(issues, 'CARE_MODEL_RULE_INVALID', path); return; }
    if (value.kind === 'none') { fields(value, ['kind'], path, issues); return; }
    fields(value, ['kind', 'amount', 'unit'], path, issues);
    if (value.kind !== 'stage-offset' || !Number.isInteger(value.amount) || value.amount < 0 || value.amount > 1200 || !['day', 'week', 'month'].includes(value.unit)) issue(issues, 'CARE_MODEL_RULE_INVALID', path);
  }

  function validateContext(context) {
    const issues = [];
    if (!fields(context, ['version', 'role', 'status', 'goal', 'closedAtISO', 'closeReason', 'closeText', 'stageOrder', 'stages', 'steps', 'facts', 'factCorrections', 'associations', 'log', 'syncNeedsReview', 'causality', 'operations'], 'careContext', issues)) return { valid: false, issues };
    if (context.version !== 2 || context.role !== 'plan' || !['active', 'closed'].includes(context.status) || !text(context.goal, 20000, false)) issue(issues, 'CARE_MODEL_PLAN_INVALID', 'careContext');
    if (own(context, 'syncNeedsReview') && typeof context.syncNeedsReview !== 'boolean') issue(issues, 'CARE_MODEL_PLAN_INVALID', 'careContext.syncNeedsReview');
    if (own(context, 'closedAtISO') && context.closedAtISO !== null && !instant(context.closedAtISO)) issue(issues, 'CARE_MODEL_PLAN_INVALID', 'careContext.closedAtISO');
    ['closeReason', 'closeText'].forEach(key => { if (own(context, key) && !text(context[key], 20000, false)) issue(issues, 'CARE_MODEL_PLAN_INVALID', 'careContext.' + key); });
    if (context.status === 'closed' && (!instant(context.closedAtISO) || !text(context.closeReason, 20000, true) || !text(context.closeText, 20000, true))) issue(issues, 'CARE_MODEL_CLOSE_INVALID', 'careContext');
    const stages = collection(context.stages, 'stages', issues, 512), steps = collection(context.steps, 'steps', issues, 4096);
    const facts = collection(context.facts, 'facts', issues, 16384), associations = collection(context.associations, 'associations', issues, 16384);
    const corrections = collection(context.factCorrections, 'factCorrections', issues, 16384);
    collection(context.log, 'log', issues, 20000);
    if (corrections.length) issue(issues, 'CARE_MODEL_CORRECTIONS_UNSUPPORTED', 'factCorrections');
    const stageIds = uniqueIds(stages, 'stages', issues), stepIds = uniqueIds(steps, 'steps', issues);
    uniqueIds(facts, 'facts', issues); uniqueIds(associations, 'associations', issues);
    const order = collection(context.stageOrder, 'stageOrder', issues, 512), orderIds = uniqueIds(order, 'stageOrder', issues);
    if (!stages.length || stageIds.size !== orderIds.size || order.some(id => !stageIds.has(id))) issue(issues, 'CARE_MODEL_STAGE_ORDER_INVALID', 'stageOrder');
    const members = new Map(), stageMap = new Map();
    stages.forEach((stage, index) => {
      const path = 'stages[' + index + ']';
      if (!fields(stage, ['id', 'kind', 'title', 'definitionOperationId', 'stepIds', 'control'], path, issues)) return;
      stageMap.set(stage.id, stage);
      if (stage.kind !== 'regular') issue(issues, stage.kind === 'legacy' ? 'CARE_MODEL_LEGACY_ADAPTER_UNSUPPORTED' : 'CARE_MODEL_STAGE_INVALID', path + '.kind');
      if (!text(stage.title, 240, true) || !identifier(stage.definitionOperationId)) issue(issues, 'CARE_MODEL_STAGE_INVALID', path);
      const ids = collection(stage.stepIds, path + '.stepIds', issues, 4096); uniqueIds(ids, path + '.stepIds', issues);
      if (!ids.length) issue(issues, 'CARE_MODEL_EMPTY_STAGE', path);
      ids.forEach(id => { if (!stepIds.has(id) || members.has(id)) issue(issues, 'CARE_MODEL_MEMBERSHIP_INVALID', path + '.stepIds'); members.set(id, stage.id); });
      if (!fields(stage.control, ['state', 'activation', 'review'], path + '.control', issues)) return;
      const control = stage.control;
      if (!['planned', 'active', 'reviewed'].includes(control.state)) issue(issues, 'CARE_MODEL_CONTROL_INVALID', path + '.control');
      if (control.state === 'planned' && (control.activation !== null || control.review !== null)) issue(issues, 'CARE_MODEL_CONTROL_INVALID', path + '.control');
      if (control.state === 'active' && control.review !== null) issue(issues, 'CARE_MODEL_CONTROL_INVALID', path + '.control.review');
      if (control.state !== 'planned') audit(control.activation, path + '.control.activation', issues, false);
      if (control.state === 'reviewed') audit(control.review, path + '.control.review', issues, true);
      if (control.state === 'reviewed' && object(control.activation) && object(control.review) && dateParts(control.activation.effectiveDateISO) && dateParts(control.review.effectiveDateISO) && control.review.effectiveDateISO < control.activation.effectiveDateISO) issue(issues, 'CARE_MODEL_REVIEW_BEFORE_ACTIVATION', path + '.control.review');
    });
    steps.forEach((step, index) => {
      const path = 'steps[' + index + ']';
      if (!fields(step, ['id', 'stageId', 'title', 'taskKind', 'instruction', 'definitionOperationId', 'requiredOutcome', 'reminderRule', 'reminderSchedule', 'omission'], path, issues)) return;
      if (!stageIds.has(step.stageId) || members.get(step.id) !== step.stageId) issue(issues, 'CARE_MODEL_MEMBERSHIP_INVALID', path);
      if (!text(step.title, 240, true) || !text(step.taskKind, 80, false) || !text(step.instruction, 20000, false) || !identifier(step.definitionOperationId) || !FACT_KINDS.includes(step.requiredOutcome)) issue(issues, 'CARE_MODEL_STEP_INVALID', path);
      reminderRule(step.reminderRule, path + '.reminderRule', issues);
      if (step.reminderSchedule !== null) {
        if (fields(step.reminderSchedule, ['dateISO', 'time', 'origin', 'activationOperationId', 'overrideOperationId'], path + '.reminderSchedule', issues)) {
          const schedule = step.reminderSchedule, stage = stageMap.get(step.stageId);
          if (!dateParts(schedule.dateISO) || own(schedule, 'time') && schedule.time !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.time) || !['stage-activation', 'manual'].includes(schedule.origin)) issue(issues, 'CARE_MODEL_SCHEDULE_INVALID', path + '.reminderSchedule');
          if (stage && stage.control && stage.control.state === 'planned') issue(issues, 'CARE_MODEL_SCHEDULE_BEFORE_ACTIVATION', path + '.reminderSchedule');
          if (schedule.origin === 'stage-activation' && (!identifier(schedule.activationOperationId) || !stage || !stage.control || !stage.control.activation || schedule.activationOperationId !== stage.control.activation.operationId)) issue(issues, 'CARE_MODEL_SCHEDULE_INVALID', path + '.reminderSchedule');
          if (schedule.origin === 'manual' && !identifier(schedule.overrideOperationId)) issue(issues, 'CARE_MODEL_SCHEDULE_INVALID', path + '.reminderSchedule');
        }
      }
      if (step.omission !== null) {
        if (object(step.omission)) {
          fields(step.omission, ['operationId', 'effectiveDateISO', 'recordedAtISO', 'recordedLocalDateISO', 'originTimeZone', 'reason'], path + '.omission', issues);
          const omission = copy(step.omission); delete omission.reason;
          audit(omission, path + '.omission', issues, false);
          if (!text(step.omission.reason, 20000, true)) issue(issues, 'CARE_MODEL_OMISSION_INVALID', path + '.omission.reason');
        } else issue(issues, 'CARE_MODEL_OMISSION_INVALID', path + '.omission');
      }
    });
    if (members.size !== stepIds.size) issue(issues, 'CARE_MODEL_MEMBERSHIP_INVALID', 'steps');
    facts.forEach((fact, index) => {
      const path = 'facts[' + index + ']';
      if (!fields(fact, ['id', 'stepId', 'kind', 'effectiveDateISO', 'recordedAtISO', 'recordedLocalDateISO', 'originTimeZone', 'operationId', 'evidence'], path, issues)) return;
      if (!stepIds.has(fact.stepId) || !FACT_KINDS.includes(fact.kind)) issue(issues, 'CARE_MODEL_FACT_INVALID', path);
      const assertion = copy(fact); ['id', 'stepId', 'kind', 'evidence'].forEach(key => { delete assertion[key]; });
      audit(assertion, path, issues, false); evidence(fact.evidence, path + '.evidence', issues);
      if (object(fact.evidence) && fact.id === fact.evidence.noteId) issue(issues, 'CARE_MODEL_FACT_ID_IS_DOCUMENT', path);
    });
    associations.forEach((association, index) => {
      const path = 'associations[' + index + ']';
      if (!fields(association, ['id', 'stepId', 'kind', 'noteId', 'sourceRecordRevAtCapture', 'operationId', 'recordedAtISO'], path, issues)) return;
      if (!stepIds.has(association.stepId) || !['result', 'event', 'document'].includes(association.kind) || !identifier(association.operationId) || !instant(association.recordedAtISO)) issue(issues, 'CARE_MODEL_ASSOCIATION_INVALID', path);
      evidence({ noteId: association.noteId, sourceRecordRevAtCapture: association.sourceRecordRevAtCapture }, path, issues);
    });
    return { valid: issues.length === 0, issues };
  }
  function validateCarePlanV2(value) {
    try { return validateContext(copy(value)); }
    catch (error) { return { valid: false, issues: [{ code: error.message, path: 'careContext' }] }; }
  }

  function recordIdentity(note) {
    const record = { id: typeof note.id === 'string' ? note.id : null, patientId: typeof note.patientId === 'string' ? note.patientId : null, title: typeof note.title === 'string' ? note.title : '', category: typeof note.category === 'string' ? note.category : null };
    if (own(note, 'rev')) record.rev = Number.isSafeInteger(note.rev) ? note.rev : null;
    return record;
  }
  function decodeCarePlanRecord(note) {
    const record = recordIdentity(object(note) ? note : {});
    const result = { kind: 'none', record, model: null, rawContext: null, issues: [] };
    if (!object(note) || !own(note, 'careContext') || note.careContext === null) {
      if (record.category === 'care-plan') { result.kind = 'unsupported'; result.issues = [{ code: 'CARE_MODEL_CONTEXT_MISSING', path: 'careContext' }]; }
      return result;
    }
    try { result.rawContext = copy(note.careContext); }
    catch (error) { result.kind = error.message === 'CARE_MODEL_JSON_LIMIT' ? 'limited' : 'unsupported'; result.issues = [{ code: error.message, path: 'careContext' }]; return result; }
    const context = result.rawContext;
    if (object(context) && context.version === 1 && LEGACY_ROLES.includes(context.role) && context.role !== 'plan') {
      if (record.category === 'care-plan') { result.kind = 'unsupported'; result.issues = [{ code: 'CARE_MODEL_RECORD_INVALID', path: 'record.category' }]; return result; }
      if (identifier(context.planId)) return result;
      result.kind = 'unsupported'; result.issues = [{ code: 'CARE_MODEL_LEGACY_INVALID', path: 'careContext.planId' }]; return result;
    }
    result.kind = 'unsupported';
    if (!object(context) || context.role !== 'plan' || ![1, 2].includes(context.version)) { result.issues = [{ code: 'CARE_MODEL_FORMAT_UNSUPPORTED', path: 'careContext.version' }]; return result; }
    if (!identifier(record.id) || !identifier(record.patientId) || note.category !== 'care-plan' || !text(record.title, 240, true)) { result.issues = [{ code: 'CARE_MODEL_RECORD_INVALID', path: 'record' }]; return result; }
    if (own(note, 'rev') && (!Number.isSafeInteger(note.rev) || note.rev < (context.version === 1 ? 0 : 1))) { result.issues = [{ code: 'CARE_MODEL_RECORD_INVALID', path: 'record.rev' }]; return result; }
    if (context.version === 1) {
      if (!Array.isArray(context.steps) || !Array.isArray(context.log) || !['active', 'closed'].includes(context.status) || context.steps.some(step => !object(step) || !identifier(step.id))) { result.issues = [{ code: 'CARE_MODEL_LEGACY_INVALID', path: 'careContext' }]; return result; }
      result.kind = 'v1'; result.model = copy(context); return result;
    }
    const validation = validateContext(context); result.issues = validation.issues;
    if (validation.valid) { result.kind = 'v2'; result.model = copy(context); }
    return result;
  }

  function projectLegacyStage(context, planId) {
    const legacy = copy(context);
    if (!identifier(planId) || !object(legacy) || legacy.version !== 1 || legacy.role !== 'plan' || !Array.isArray(legacy.steps) || !Array.isArray(legacy.log)) throw new Error('CARE_MODEL_LEGACY_INVALID');
    return { viewKey: 'legacy:' + planId, kind: 'legacy', title: 'Dotychczasowy plan', control: null, legacyState: 'unclassified',
      steps: legacy.steps.map(step => ({ viewKey: 'legacy:' + planId + ':step:' + step.id, id: step.id, legacy: copy(step),
        legacyCompletion: step.state === 'done' ? { state: 'done', provenance: 'unknown', storedSource: step.completionSource || null } : null,
        facts: [] })), legacyContext: legacy };
  }
  function reviewBasis(context, stage) {
    const operations = [stage.definitionOperationId, stage.control.activation && stage.control.activation.operationId];
    const ids = new Set(stage.stepIds);
    context.steps.filter(step => ids.has(step.id)).forEach(step => {
      operations.push(step.definitionOperationId);
      if (step.omission) operations.push(step.omission.operationId);
      if (step.reminderSchedule) operations.push(step.reminderSchedule.overrideOperationId || step.reminderSchedule.activationOperationId);
    });
    context.facts.filter(fact => ids.has(fact.stepId)).forEach(fact => { operations.push(fact.operationId); });
    context.associations.filter(association => ids.has(association.stepId)).forEach(association => { operations.push(association.operationId); });
    return Array.from(new Set(operations.filter(Boolean))).sort();
  }
  function sameSet(left, right) {
    const a = left.slice().sort(), b = right.slice().sort();
    return a.length === b.length && a.every((value, index) => value === b[index]);
  }
  function stepProgress(step, facts) {
    const conflicts = [];
    FACT_KINDS.forEach(kind => { if (facts.filter(fact => fact.kind === kind).length > 1) conflicts.push('multiple-' + kind); });
    if (step.omission && facts.some(fact => fact.kind === step.requiredOutcome)) conflicts.push('omission-and-required-fact');
    const performance = facts.filter(fact => fact.kind === 'performance'), receipts = facts.filter(fact => fact.kind === 'resultReceipt');
    if (performance.length === 1 && receipts.length === 1 && receipts[0].effectiveDateISO < performance[0].effectiveDateISO) conflicts.push('receipt-before-performance');
    return { progress: conflicts.length ? 'review' : step.omission ? 'omitted' : facts.some(fact => fact.kind === step.requiredOutcome) ? 'resolved' : step.requiredOutcome === 'resultReceipt' && performance.length ? 'waiting' : 'pending', conflicts };
  }
  function projectCarePlan(decoded, options) {
    // Re-decode detached data: a caller cannot forge kind:'v2' and bypass the
    // structural checks, nor mutate a previously decoded model into authority.
    const supplied = object(decoded) ? decoded : {};
    const identity = object(supplied.record) ? supplied.record : {};
    const checked = decodeCarePlanRecord(Object.assign({}, identity, { careContext: supplied.rawContext }));
    if (supplied.kind === 'limited' && supplied.rawContext === null) {
      checked.kind = 'limited'; checked.issues = [{ code: 'CARE_MODEL_JSON_LIMIT', path: 'careContext' }];
    }
    if (supplied.kind === 'unsupported' && supplied.rawContext === null && Array.isArray(supplied.issues) && supplied.issues.some(item => item && item.code === 'CARE_MODEL_INVALID_JSON')) {
      checked.kind = 'unsupported'; checked.issues = [{ code: 'CARE_MODEL_INVALID_JSON', path: 'careContext' }];
    }
    const view = { kind: checked.kind, record: copy(checked.record), readOnly: true, provenanceVerified: false, writeCapability: WRITE_CAPABILITY,
      rawContext: checked.rawContext === null ? null : copy(checked.rawContext), issues: copy(checked.issues), stages: null, facts: [], associations: [], attentionItems: [], nextAction: null };
    if (checked.kind === 'none') return view;
    if (checked.kind === 'limited') { view.nextAction = { type: 'viewLimit' }; view.attentionItems.push({ key: 'limit:' + (identity.id || 'unknown'), type: 'viewLimit', dueDateISO: null, overdue: false }); return view; }
    if (checked.kind === 'unsupported') { view.nextAction = { type: 'unsupportedFormat' }; view.attentionItems.push({ key: 'format:' + (identity.id || 'unknown'), type: 'unsupportedFormat', dueDateISO: null, overdue: false }); return view; }
    const context = checked.model;
    if (checked.kind === 'v1') { view.stages = [projectLegacyStage(context, identity.id)]; return view; }
    const today = options && options.todayLocalDateISO;
    if (today !== undefined && !dateParts(today)) { view.issues.push({ code: 'CARE_MODEL_TODAY_INVALID', path: 'todayLocalDateISO' }); }
    const knownToday = dateParts(today) ? today : null;
    view.facts = copy(context.facts); view.associations = copy(context.associations);
    view.stages = context.stageOrder.map(stageId => {
      const stage = context.stages.find(item => item.id === stageId), control = stage.control;
      const reviewStale = control.state === 'reviewed' && !sameSet(control.review.reviewBasis, reviewBasis(context, stage));
      const steps = stage.stepIds.map(stepId => {
        const step = context.steps.find(item => item.id === stepId), facts = context.facts.filter(fact => fact.stepId === stepId);
        const progress = stepProgress(step, facts), editable = context.status === 'active' && control.state !== 'reviewed' && !context.syncNeedsReview && !progress.conflicts.length;
        return Object.assign({}, copy(step), progress, { facts: copy(facts), associations: copy(context.associations.filter(item => item.stepId === stepId)),
          workflowEligibility: { canLinkResult: editable, canLinkEvent: editable, canRecordFact: editable, canOmit: editable && !['resolved', 'omitted'].includes(progress.progress) },
          capabilities: { canLinkResult: false, canLinkEvent: false, canRecordFact: false, canOmit: false }, evidenceVerified: false });
      });
      return Object.assign({}, copy(stage), { controlState: control.state, reviewStale: reviewStale || control.state === 'reviewed' && steps.some(step => !['resolved', 'omitted'].includes(step.progress)), steps,
        readyForReview: control.state === 'active' && steps.every(step => ['resolved', 'omitted'].includes(step.progress)) });
    });
    const active = view.stages.filter(stage => stage.controlState === 'active');
    const orderConflict = view.stages.some((stage, index) => stage.controlState !== 'planned' && view.stages.slice(0, index).some(before => before.controlState !== 'reviewed'));
    const conflicted = !!context.syncNeedsReview || active.length > 1 || orderConflict || view.stages.some(stage => stage.steps.some(step => step.conflicts.length));
    const stale = view.stages.some(stage => stage.reviewStale);
    const attention = (type, stage, step, due) => {
      const row = { key: [identity.id, type, stage && stage.id, step && step.id].filter(Boolean).join(':'), type, planId: identity.id,
        stageId: stage ? stage.id : null, stepId: step ? step.id : null, dueDateISO: due || null, overdue: !!(due && knownToday && due < knownToday) };
      view.attentionItems.push(row); return row;
    };
    if (conflicted || stale) {
      view.nextAction = attention(conflicted ? 'resolveConflict' : 'reviewChangedStage');
      view.stages.forEach(stage => stage.steps.forEach(step => Object.keys(step.workflowEligibility).forEach(key => { step.workflowEligibility[key] = false; })));
      return view;
    }
    if (context.status === 'closed') return view;
    if (active.length === 1) {
      const stage = active[0];
      if (stage.readyForReview) view.nextAction = attention('reviewStage', stage);
      else stage.steps.filter(step => !['resolved', 'omitted'].includes(step.progress)).forEach(step => {
        const due = step.reminderSchedule && step.reminderSchedule.dateISO;
        if (!due || knownToday && due <= knownToday) attention('work', stage, step, due);
      });
    } else {
      const next = view.stages.find(stage => stage.controlState === 'planned');
      if (next && view.stages.slice(0, view.stages.indexOf(next)).every(stage => stage.controlState === 'reviewed')) view.nextAction = attention('startStage', next);
      else if (!next && view.stages.every(stage => stage.controlState === 'reviewed')) view.nextAction = attention('decidePlan');
      else view.nextAction = attention('resolveConflict');
    }
    return view;
  }

  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (object(value)) {
      const result = {};
      Object.keys(value).sort().forEach(key => Object.defineProperty(result, key, { value: canonical(value[key]), enumerable: true }));
      return result;
    }
    return value;
  }
  function canonicalizeV2Component(key, value) {
    if (!['metadata', 'status', 'stageOrder'].includes(key) && !(typeof key === 'string' && /^(stage|step|fact|association):[A-Za-z0-9_.-]{1,160}$/.test(key))) throw new Error('CARE_MODEL_COMPONENT_INVALID');
    return JSON.stringify(canonical({ codec: 'care-plan-components', version: 2, key, value: copy(value) }));
  }

  root.VildaCarePlanModel = Object.freeze({ VERSION: 1, decodeCarePlanRecord, validateCarePlanV2, projectLegacyStage, projectCarePlan,
    calculateStageReminderDate, canonicalizeV2Component, getWriteCapability: function () { return WRITE_CAPABILITY; } });
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
