/* Pure proposed care-plan transactions. No authentication, clock, randomness,
 * storage, network or patient writes. Only a protected writer may accept the
 * proposal after fresh account, source-version, patient and document checks.
 *
 * prepareTransaction(current|null, command, clock)
 * command: action, operationId, planId, patientId, expectedRevision plus the
 * exact action fields below. A retry retains the exact original command.
 * clock: recordedAtISO, recordedLocalDateISO, originTimeZone (supplied by caller).
 *
 * State wraps the existing V2 reader record, immutable source-version content,
 * reserved reminder IDs and an append-only command ledger. It is deliberately
 * not a legacy note payload. Document effects are inseparable transaction
 * proposals, not permission to mutate the referenced original records.
 */
(function (root) {
  'use strict';
  if (!root) return;
  const FORMAT = 'vilda-care-plan-state/v1', VERSION = 1;
  const LIMITS = Object.freeze({ maxOperations: 4096, maxJsonNodes: 1000000,
    maxJsonTextUnits: 32 * 1024 * 1024, maxJsonDepth: 48, maxDocumentTextUnits: 20000 });
  const ID = /^[A-Za-z0-9_.-]{1,160}$/, DIGEST = /^[a-f0-9]{64}$/;
  const COMMON = ['action', 'operationId', 'planId', 'patientId', 'expectedRevision'];
  const ACTION_FIELDS = Object.freeze({
    createFromTemplate: ['draft', 'documentIds'],
    activateStage: ['stageId', 'effectiveDateISO'],
    recordFact: ['stepId', 'factId', 'kind', 'effectiveDateISO', 'evidence', 'document'],
    associate: ['stepId', 'associationId', 'kind', 'evidence'],
    omitStep: ['stepId', 'reason', 'effectiveDateISO', 'documentId'],
    reopenStep: ['stepId', 'reason', 'effectiveDateISO', 'documentId'],
    reviewStage: ['stageId', 'effectiveDateISO'],
    reopenStage: ['stageId', 'reason', 'effectiveDateISO', 'documentId'],
    setReminder: ['stepId', 'dateISO', 'time'],
    closePlan: ['reason', 'text', 'effectiveDateISO', 'documentId', 'confirmOpenWork'],
    reopenPlan: ['reason', 'effectiveDateISO', 'documentId']
  });
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const id = value => typeof value === 'string' && ID.test(value);
  const text = (value, max, required) => typeof value === 'string' && value.length <= max && (!required || !!value.trim());
  const flags = { provenanceVerified: false, writerAvailable: false };
  function fail(code) { throw Object.assign(new Error(code), { mutationCode: code }); }
  function reject(code) { return Object.assign({ ok: false, code }, flags); }
  function copy(value) {
    let nodes = 0, units = 0; const ancestors = new Set();
    function visit(item, depth) {
      if (++nodes > LIMITS.maxJsonNodes || depth > LIMITS.maxJsonDepth) fail('CARE_PLAN_LIMIT');
      if (item === null || typeof item === 'boolean') return item;
      if (typeof item === 'number' && Number.isFinite(item)) return item;
      if (typeof item === 'string') { if ((units += item.length) > LIMITS.maxJsonTextUnits) fail('CARE_PLAN_LIMIT'); return item; }
      if (!item || typeof item !== 'object' || ancestors.has(item)) fail('CARE_PLAN_INPUT_INVALID');
      const prototype = Object.getPrototypeOf(item);
      if (!Array.isArray(item) && prototype !== null && Object.getPrototypeOf(prototype) !== null) fail('CARE_PLAN_INPUT_INVALID');
      const keys = Reflect.ownKeys(item);
      if (keys.some(key => typeof key !== 'string' || !Object.getOwnPropertyDescriptor(item, key).enumerable && !(Array.isArray(item) && key === 'length')))
        fail('CARE_PLAN_INPUT_INVALID');
      if (Array.isArray(item) && (Object.keys(item).length !== item.length || Object.keys(item).some((key, index) => key !== String(index)))) fail('CARE_PLAN_INPUT_INVALID');
      ancestors.add(item); const result = Array.isArray(item) ? [] : {};
      for (const key of Object.keys(item)) {
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (!descriptor || !own(descriptor, 'value')) fail('CARE_PLAN_INPUT_INVALID');
        if ((units += key.length) > LIMITS.maxJsonTextUnits) fail('CARE_PLAN_LIMIT');
        Object.defineProperty(result, key, { value: visit(descriptor.value, depth + 1), enumerable: true, configurable: true, writable: true });
      }
      ancestors.delete(item); return result;
    }
    return visit(value, 0);
  }
  function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (object(value)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
    return JSON.stringify(value);
  }
  function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  function fields(value, allowed, required) {
    if (!object(value) || Object.keys(value).some(key => !allowed.includes(key)) || (required || allowed).some(key => !own(value, key))) fail('CARE_PLAN_FIELDS_INVALID');
    return value;
  }
  function dependencies() {
    const model = root.VildaCarePlanModel, templates = root.VildaCareTemplateModel;
    if (!model || !templates || typeof model.getStageReviewBasis !== 'function' || typeof templates.canonicalDefinition !== 'function') fail('CARE_PLAN_DEPENDENCY_UNAVAILABLE');
    return { model, templates };
  }
  function validDate(value, model) { return typeof value === 'string' && model.calculateStageReminderDate(value, 0, 'day').ok; }
  function validInstant(value, model) {
    const match = typeof value === 'string' && /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?Z$/.exec(value);
    return !!(match && validDate(match[1], model) && +match[2] < 24 && +match[3] < 60 && +match[4] < 60);
  }
  function checkClock(value, model) {
    fields(value, ['recordedAtISO', 'recordedLocalDateISO', 'originTimeZone']);
    if (!validInstant(value.recordedAtISO, model) || !validDate(value.recordedLocalDateISO, model) || !text(value.originTimeZone, 100, true)) fail('CARE_PLAN_CLOCK_INVALID');
    return value;
  }
  function effectiveDate(value, clock, model) {
    if (!validDate(value, model) || value > clock.recordedLocalDateISO) fail('CARE_PLAN_EFFECTIVE_DATE_INVALID');
    return value;
  }
  function checkSource(value, templates) {
    fields(value, ['templateId', 'revisionId', 'revisionNumber', 'baseToken', 'definition']);
    if (!id(value.templateId) || !id(value.revisionId) || !Number.isSafeInteger(value.revisionNumber) || value.revisionNumber < 1
        || typeof value.baseToken !== 'string' || !DIGEST.test(value.baseToken)) fail('CARE_PLAN_SOURCE_INVALID');
    const canonicalSource = templates.canonicalDefinition(value.definition);
    if (!canonicalSource.ok || canonical(value.definition) !== canonical(canonicalSource.definition)) fail('CARE_PLAN_SOURCE_INVALID');
  }
  function checkDocumentIds(value, steps, forbidden) {
    fields(value, ['reminders']);
    if (!object(value.reminders) || Object.keys(value.reminders).length !== steps.length) fail('CARE_PLAN_DOCUMENT_IDS_INVALID');
    const used = new Set(forbidden);
    for (const step of steps) {
      const next = own(value.reminders, step.id) && value.reminders[step.id];
      if (!id(next) || used.has(next)) fail('CARE_PLAN_DOCUMENT_IDS_INVALID');
      used.add(next);
    }
  }
  function sourceIds(source) { return [source.templateId, source.revisionId].concat(source.definition.stageOrder, source.definition.steps.map(step => step.id)); }
  function identifiers(state) {
    const context = state.record.careContext;
    return new Set([state.record.id, state.record.patientId].concat(sourceIds(state.source), context.stageOrder,
      context.steps.map(step => step.id), context.facts.map(fact => fact.id), context.associations.map(item => item.id),
      Object.values(state.documentIds.reminders), state.operations.map(operation => operation.id),
      context.facts.map(fact => fact.evidence.noteId), context.associations.map(item => item.noteId),
      context.log.flatMap(entry => entry.documentIds)));
  }
  function freshId(value, used) { if (!id(value) || used.has(value)) fail('CARE_PLAN_ID_CONFLICT'); used.add(value); return value; }
  function checkRecord(record, model) {
    fields(record, ['id', 'patientId', 'title', 'category', 'rev', 'careContext']);
    if (!id(record.id) || !id(record.patientId) || record.id === record.patientId || record.category !== 'care-plan'
        || !text(record.title, 240, true) || !Number.isSafeInteger(record.rev) || record.rev < 1) fail('CARE_PLAN_STATE_INVALID');
    if (model.decodeCarePlanRecord(record).kind !== 'v2') fail('CARE_PLAN_STATE_INVALID');
    fields(record.careContext, ['version', 'role', 'status', 'goal', 'closedAtISO', 'closeReason', 'closeText',
      'stageOrder', 'stages', 'steps', 'facts', 'factCorrections', 'associations', 'log', 'syncNeedsReview']);
  }
  function checkState(state, model, templates) {
    fields(state, ['format', 'source', 'record', 'documentIds', 'operations']);
    if (state.format !== FORMAT) fail('CARE_PLAN_FORMAT_UNSUPPORTED');
    checkSource(state.source, templates); checkRecord(state.record, model);
    const context = state.record.careContext;
    checkDocumentIds(state.documentIds, context.steps, [state.record.id, state.record.patientId].concat(sourceIds(state.source), context.stageOrder, context.steps.map(step => step.id)));
    if (!Array.isArray(state.operations) || !state.operations.length || state.operations.length > LIMITS.maxOperations
        || state.operations.length !== state.record.rev || context.log.length !== state.operations.length) fail('CARE_PLAN_HISTORY_INVALID');
    const operations = new Set(), entityIds = [state.record.id, state.record.patientId].concat(sourceIds(state.source),
      context.stageOrder, context.steps.map(step => step.id), context.facts.map(fact => fact.id),
      context.associations.map(item => item.id), Object.values(state.documentIds.reminders));
    if (new Set(entityIds).size !== entityIds.length || context.factCorrections.length !== 0) fail('CARE_PLAN_STATE_INVALID');
    let creation;
    state.operations.forEach((operation, index) => {
      fields(operation, ['id', 'intentCanonical', 'fromRevision', 'toRevision', 'clock']);
      if (!id(operation.id) || operations.has(operation.id) || entityIds.includes(operation.id) || operation.fromRevision !== index || operation.toRevision !== index + 1
          || !text(operation.intentCanonical, LIMITS.maxJsonTextUnits, true)) fail('CARE_PLAN_HISTORY_INVALID');
      checkClock(operation.clock, model);
      let intent; try { intent = copy(JSON.parse(operation.intentCanonical)); } catch { fail('CARE_PLAN_HISTORY_INVALID'); }
      commandShape(intent);
      if (canonical(intent) !== operation.intentCanonical || intent.operationId !== operation.id
          || intent.planId !== state.record.id || intent.patientId !== state.record.patientId
          || intent.expectedRevision !== (index ? index : null) || !own(ACTION_FIELDS, intent.action)
          || (index === 0) !== (intent.action === 'createFromTemplate')) fail('CARE_PLAN_HISTORY_INVALID');
      if (index === 0) creation = intent;
      const entry = context.log[index];
      fields(entry, ['operationId', 'action', 'recordedAtISO', 'recordedLocalDateISO', 'originTimeZone', 'effectiveDateISO', 'stageId', 'stepId', 'documentIds', 'text']);
      if (entry.operationId !== operation.id || entry.action !== intent.action || entry.recordedAtISO !== operation.clock.recordedAtISO
          || entry.recordedLocalDateISO !== operation.clock.recordedLocalDateISO || entry.originTimeZone !== operation.clock.originTimeZone
          || !validDate(entry.effectiveDateISO, model) || entry.effectiveDateISO > entry.recordedLocalDateISO
          || entry.stageId !== null && !context.stageOrder.includes(entry.stageId)
          || entry.stepId !== null && !context.steps.some(step => step.id === entry.stepId)
          || !Array.isArray(entry.documentIds) || entry.documentIds.some(value => !id(value)) || new Set(entry.documentIds).size !== entry.documentIds.length
          || !text(entry.text, LIMITS.maxDocumentTextUnits, false)) fail('CARE_PLAN_HISTORY_INVALID');
      operations.add(operation.id);
    });
    // The engine has no definition-edit or source-replacement operation.
    // Current definitions must therefore remain the initial selected/edited
    // copy; source content is the complete immutable original version.
    fields(creation.draft, ['source', 'definition']);
    const definition = templates.canonicalDefinition(creation.draft.definition);
    if (!definition.ok || canonical(creation.draft.source) !== canonical(state.source)
        || canonical(creation.documentIds) !== canonical(state.documentIds)
        || state.record.title !== definition.definition.name || context.goal !== definition.definition.purpose
        || canonical(context.stageOrder) !== canonical(definition.definition.stageOrder)
        || canonical(context.stages.map(stage => ({ id: stage.id, title: stage.title, stepIds: stage.stepIds })))
          !== canonical(definition.definition.stages)
        || canonical(context.steps.map(step => ({ id: step.id, stageId: step.stageId, title: step.title,
          taskKind: step.taskKind, instruction: step.instruction, requiredOutcome: step.requiredOutcome, reminderRule: step.reminderRule })))
          !== canonical(definition.definition.steps.map(({ includedByDefault, ...step }) => step))
        || context.stages.some(stage => stage.definitionOperationId !== creation.operationId || stage.kind !== 'regular')
        || context.steps.some(step => step.definitionOperationId !== creation.operationId)) fail('CARE_PLAN_STATE_INVALID');
    const referenced = context.stages.flatMap(stage => [stage.definitionOperationId,
      stage.control.activation && stage.control.activation.operationId, stage.control.review && stage.control.review.operationId,
      ...(stage.control.review ? stage.control.review.reviewBasis : [])])
      .concat(context.steps.flatMap(step => [step.definitionOperationId, step.omission && step.omission.operationId,
        step.reminderSchedule && (step.reminderSchedule.overrideOperationId || step.reminderSchedule.activationOperationId)]),
      context.facts.map(fact => fact.operationId), context.associations.map(item => item.operationId));
    if (referenced.some(value => value && !operations.has(value))) fail('CARE_PLAN_HISTORY_INVALID');
    return state;
  }
  function validatedState(value) {
    try { const deps = dependencies(), state = copy(value); checkState(state, deps.model, deps.templates); return { ok: true, state: freeze(state), ...flags }; }
    catch (error) { return reject(errorCode(error)); }
  }
  function errorCode(error) {
    try {
      const descriptor = error && Object.getOwnPropertyDescriptor(error, 'mutationCode');
      return descriptor && own(descriptor, 'value') && typeof descriptor.value === 'string' && /^CARE_PLAN_[A-Z_]+$/.test(descriptor.value)
        ? descriptor.value : 'CARE_PLAN_INPUT_INVALID';
    } catch { return 'CARE_PLAN_INPUT_INVALID'; }
  }
  function commandShape(command) {
    if (!object(command) || typeof command.action !== 'string' || !own(ACTION_FIELDS, command.action)) fail('CARE_PLAN_ACTION_UNSUPPORTED');
    fields(command, COMMON.concat(ACTION_FIELDS[command.action]), COMMON.concat(ACTION_FIELDS[command.action].filter(key => !['evidence', 'document'].includes(key))));
    if (!id(command.operationId) || !id(command.planId) || !id(command.patientId)
        || new Set([command.operationId, command.planId, command.patientId]).size !== 3) fail('CARE_PLAN_ID_INVALID');
    if (command.action === 'createFromTemplate' ? command.expectedRevision !== null
      : !Number.isSafeInteger(command.expectedRevision) || command.expectedRevision < 1) fail('CARE_PLAN_REVISION_INVALID');
    return command;
  }
  function projection(state, model, today) { return model.projectCarePlan(model.decodeCarePlanRecord(state.record), { todayLocalDateISO: today }); }
  function assertWorkflow(view) { if (view.nextAction && ['resolveConflict', 'reviewChangedStage'].includes(view.nextAction.type)) fail('CARE_PLAN_REVIEW_REQUIRED'); }
  function audit(command, clock) { return { operationId: command.operationId, effectiveDateISO: command.effectiveDateISO,
    recordedAtISO: clock.recordedAtISO, recordedLocalDateISO: clock.recordedLocalDateISO, originTimeZone: clock.originTimeZone }; }
  function stageFor(context, stageId) { const stage = context.stages.find(item => item.id === stageId); if (!stage) fail('CARE_PLAN_STAGE_MISSING'); return stage; }
  function stepFor(context, stepId) { const step = context.steps.find(item => item.id === stepId); if (!step) fail('CARE_PLAN_STEP_MISSING'); return step; }
  function editableStage(context, stage) { if (context.status !== 'active') fail('CARE_PLAN_CLOSED'); if (stage.control.state === 'reviewed') fail('CARE_PLAN_STAGE_REVIEWED'); }
  function checkEvidence(value) {
    fields(value, ['noteId', 'sourceRecordRevAtCapture']);
    if (!id(value.noteId) || !Number.isSafeInteger(value.sourceRecordRevAtCapture) || value.sourceRecordRevAtCapture < 0) fail('CARE_PLAN_EVIDENCE_INVALID');
  }
  function effectDocument(state, command, clock, document, role, stageId, stepId) {
    fields(document, ['id', 'title', 'body']);
    if (!id(document.id) || !text(document.title, 240, true) || !text(document.body, LIMITS.maxDocumentTextUnits, true)) fail('CARE_PLAN_DOCUMENT_INVALID');
    return { action: 'createDocument', document: { id: document.id, patientId: state.record.patientId,
      // A confirmation of receipt is authored documentation, not a fabricated
      // structured laboratory result. Original result records stay references.
      title: document.title, body: document.body, category: 'observation',
      clinicalDateISO: command.effectiveDateISO || clock.recordedLocalDateISO,
      careContext: { version: 2, role, planId: state.record.id, stageId: stageId || null, stepId: stepId || null } }, expectedRevision: null };
  }
  function reminderProjection(state, model, today) {
    const view = projection(state, model, today), map = new Map();
    for (const stage of view.stages) for (const step of stage.steps) {
      // An unstarted stage never creates work. Resolved/omitted steps likewise
      // remain visible in the plan without inventing completed calendar events.
      const active = state.record.careContext.status === 'active' && stage.controlState === 'active'
        && !['resolved', 'omitted'].includes(step.progress);
      map.set(step.id, { action: 'projectReminder', id: state.documentIds.reminders[step.id], patientId: state.record.patientId,
        title: step.title, body: step.instruction, dueDateISO: step.reminderSchedule ? step.reminderSchedule.dateISO : null,
        dueTime: step.reminderSchedule && step.reminderSchedule.time || null, active, state: step.progress,
        careContext: { version: 2, role: 'step', planId: state.record.id, stageId: stage.id, stepId: step.id, state: step.progress } });
    }
    return map;
  }
  function prepareTransaction(currentValue, commandValue, clockValue) {
    try {
      const { model, templates } = dependencies(), command = commandShape(copy(commandValue));
      const current = currentValue === null ? null : checkState(copy(currentValue), model, templates);
      const intentCanonical = canonical(command);
      if (current) {
        if (current.record.id !== command.planId || current.record.patientId !== command.patientId) fail('CARE_PLAN_PATIENT_MISMATCH');
        const prior = current.operations.find(operation => operation.id === command.operationId);
        if (prior) {
          if (prior.intentCanonical !== intentCanonical) fail('CARE_PLAN_OPERATION_MISMATCH');
          return freeze({ ok: true, reused: true, state: current, preconditions: { planId: command.planId,
            patientId: command.patientId, expectedRevision: current.record.rev }, documentEffects: [], readDependencies: [], ...flags });
        }
        if (command.action === 'createFromTemplate' || command.expectedRevision !== current.record.rev) fail('CARE_PLAN_REVISION_CONFLICT');
        if (current.operations.length >= LIMITS.maxOperations) fail('CARE_PLAN_OPERATION_LIMIT');
      } else if (command.action !== 'createFromTemplate') fail('CARE_PLAN_MISSING');
      const clock = checkClock(copy(clockValue), model), documentEffects = [], readDependencies = [];
      let state = current, logText = '', stageId = null, stepId = null;
      const documentIds = [];
      if (!state) {
        fields(command.draft, ['source', 'definition']); checkSource(command.draft.source, templates);
        const selected = templates.canonicalDefinition(command.draft.definition);
        if (!selected.ok) fail('CARE_PLAN_DEFINITION_INVALID');
        const definition = selected.definition, used = new Set(sourceIds(command.draft.source).concat([command.patientId, command.planId, command.operationId]));
        for (const nextId of definition.stageOrder.concat(definition.steps.map(step => step.id))) freshId(nextId, used);
        checkDocumentIds(command.documentIds, definition.steps, used);
        const context = { version: 2, role: 'plan', status: 'active', goal: definition.purpose,
          closedAtISO: null, closeReason: '', closeText: '', stageOrder: definition.stageOrder.slice(),
          stages: definition.stageOrder.map(nextId => { const item = definition.stages.find(stage => stage.id === nextId);
            return { id: item.id, kind: 'regular', title: item.title, definitionOperationId: command.operationId,
              stepIds: item.stepIds.slice(), control: { state: 'planned', activation: null, review: null } }; }),
          steps: definition.steps.map(item => ({ id: item.id, stageId: item.stageId, title: item.title, taskKind: item.taskKind,
            instruction: item.instruction, definitionOperationId: command.operationId, requiredOutcome: item.requiredOutcome,
            reminderRule: copy(item.reminderRule), reminderSchedule: null, omission: null })),
          facts: [], factCorrections: [], associations: [], log: [], syncNeedsReview: false };
        state = { format: FORMAT, source: copy(command.draft.source), record: { id: command.planId, patientId: command.patientId,
          title: definition.name, category: 'care-plan', rev: 1, careContext: context }, documentIds: copy(command.documentIds), operations: [] };
        logText = 'Utworzono plan z wybranej wersji szablonu.';
      } else {
        const context = state.record.careContext, before = projection(state, model, clock.recordedLocalDateISO);
        assertWorkflow(before);
        const used = identifiers(state); freshId(command.operationId, used);
        const reasonDocument = (reason, title, role, targetStage, targetStep) => {
          if (!text(reason, LIMITS.maxDocumentTextUnits, true)) fail('CARE_PLAN_REASON_REQUIRED');
          freshId(command.documentId, used);
          documentEffects.push(effectDocument(state, command, clock, { id: command.documentId, title, body: reason }, role, targetStage, targetStep));
          documentIds.push(command.documentId); return reason;
        };
        if (own(command, 'effectiveDateISO')) effectiveDate(command.effectiveDateISO, clock, model);
        if (command.action !== 'reopenPlan' && context.status !== 'active') fail('CARE_PLAN_CLOSED');
        if (command.action === 'activateStage') {
          const stage = stageFor(context, command.stageId), index = context.stageOrder.indexOf(stage.id); stageId = stage.id;
          if (stage.control.state !== 'planned' || context.stages.some(item => item.control.state === 'active')
              || context.stageOrder.slice(0, index).some(nextId => stageFor(context, nextId).control.state !== 'reviewed')) fail('CARE_PLAN_STAGE_ORDER');
          const previous = index && stageFor(context, context.stageOrder[index - 1]);
          if (previous && previous.control.review.effectiveDateISO > command.effectiveDateISO) fail('CARE_PLAN_STAGE_CHRONOLOGY');
          stage.control = { state: 'active', activation: audit(command, clock), review: null };
          context.steps.filter(step => step.stageId === stage.id).forEach(step => {
            if (step.reminderRule.kind === 'none') return;
            const due = model.calculateStageReminderDate(command.effectiveDateISO, step.reminderRule.amount, step.reminderRule.unit);
            if (!due.ok) fail('CARE_PLAN_REMINDER_DATE_INVALID');
            step.reminderSchedule = { dateISO: due.dateISO, time: null, origin: 'stage-activation', activationOperationId: command.operationId };
          });
          logText = 'Uruchomiono etap: ' + stage.title + '.';
        } else if (command.action === 'recordFact') {
          const step = stepFor(context, command.stepId), stage = stageFor(context, step.stageId); editableStage(context, stage);
          stepId = step.id; stageId = stage.id;
          if (!['performance', 'resultReceipt', 'decision'].includes(command.kind)) fail('CARE_PLAN_FACT_KIND_INVALID');
          if (context.facts.some(fact => fact.stepId === step.id && fact.kind === command.kind)) fail('CARE_PLAN_FACT_EXISTS');
          if (step.omission && command.kind === step.requiredOutcome) fail('CARE_PLAN_STEP_OMITTED');
          freshId(command.factId, used);
          if (own(command, 'evidence') === own(command, 'document')) fail('CARE_PLAN_EVIDENCE_INVALID');
          let evidence;
          if (command.evidence) {
            checkEvidence(command.evidence); evidence = copy(command.evidence);
            if (used.has(evidence.noteId) && !context.facts.some(fact => fact.evidence.noteId === evidence.noteId)
                && !context.associations.some(item => item.noteId === evidence.noteId)) fail('CARE_PLAN_EVIDENCE_INVALID');
            readDependencies.push({ noteId: evidence.noteId, patientId: command.patientId,
              expectedRevision: evidence.sourceRecordRevAtCapture, kind: command.kind });
          } else {
            freshId(command.document && command.document.id, used);
            documentEffects.push(effectDocument(state, command, clock, command.document, command.kind === 'resultReceipt' ? 'result' : 'note', stage.id, step.id));
            documentIds.push(command.document.id); evidence = { noteId: command.document.id, sourceRecordRevAtCapture: 1 };
          }
          const counterpart = context.facts.find(fact => fact.stepId === step.id && fact.kind === (command.kind === 'performance' ? 'resultReceipt' : 'performance'));
          if (counterpart && (command.kind === 'performance' && command.effectiveDateISO > counterpart.effectiveDateISO
              || command.kind === 'resultReceipt' && command.effectiveDateISO < counterpart.effectiveDateISO)) fail('CARE_PLAN_FACT_CHRONOLOGY');
          context.facts.push({ id: command.factId, stepId: step.id, kind: command.kind, ...audit(command, clock), evidence });
          logText = 'Zapisano jawne potwierdzenie kroku: ' + step.title + '.';
        } else if (command.action === 'associate') {
          const step = stepFor(context, command.stepId), stage = stageFor(context, step.stageId); editableStage(context, stage);
          stepId = step.id; stageId = stage.id;
          if (!['result', 'event', 'document'].includes(command.kind)) fail('CARE_PLAN_ASSOCIATION_INVALID');
          checkEvidence(command.evidence); freshId(command.associationId, used);
          if (used.has(command.evidence.noteId) && !context.facts.some(fact => fact.evidence.noteId === command.evidence.noteId)
              && !context.associations.some(item => item.noteId === command.evidence.noteId)) fail('CARE_PLAN_EVIDENCE_INVALID');
          if (context.associations.some(item => item.stepId === step.id && item.kind === command.kind && item.noteId === command.evidence.noteId)) fail('CARE_PLAN_ASSOCIATION_EXISTS');
          context.associations.push({ id: command.associationId, stepId: step.id, kind: command.kind,
            noteId: command.evidence.noteId, sourceRecordRevAtCapture: command.evidence.sourceRecordRevAtCapture,
            operationId: command.operationId, recordedAtISO: clock.recordedAtISO });
          readDependencies.push({ noteId: command.evidence.noteId, patientId: command.patientId,
            expectedRevision: command.evidence.sourceRecordRevAtCapture, kind: command.kind });
          logText = 'Powiązano oryginalny dokument z krokiem: ' + step.title + '.';
        } else if (command.action === 'omitStep' || command.action === 'reopenStep') {
          const step = stepFor(context, command.stepId), stage = stageFor(context, step.stageId); editableStage(context, stage);
          stepId = step.id; stageId = stage.id;
          const progress = before.stages.find(item => item.id === stage.id).steps.find(item => item.id === step.id).progress;
          if (command.action === 'omitStep' ? ['resolved', 'omitted'].includes(progress) : !step.omission) fail('CARE_PLAN_STEP_STATE');
          if (command.action === 'reopenStep' && command.effectiveDateISO < step.omission.effectiveDateISO) fail('CARE_PLAN_STEP_CHRONOLOGY');
          const reason = reasonDocument(command.reason, command.action === 'omitStep' ? 'Pominięcie kroku' : 'Wznowienie kroku', 'decision', stage.id, step.id);
          step.omission = command.action === 'omitStep' ? { ...audit(command, clock), reason } : null;
          logText = reason;
        } else if (command.action === 'reviewStage') {
          const stage = stageFor(context, command.stageId), projected = before.stages.find(item => item.id === stage.id); stageId = stage.id;
          if (stage.control.state !== 'active' || !projected.readyForReview) fail('CARE_PLAN_STAGE_NOT_READY');
          if (command.effectiveDateISO < stage.control.activation.effectiveDateISO) fail('CARE_PLAN_STAGE_CHRONOLOGY');
          const dates = context.facts.filter(fact => stage.stepIds.includes(fact.stepId)).map(fact => fact.effectiveDateISO)
            .concat(context.steps.filter(step => step.stageId === stage.id && step.omission).map(step => step.omission.effectiveDateISO));
          if (dates.some(date => date > command.effectiveDateISO)) fail('CARE_PLAN_STAGE_CHRONOLOGY');
          stage.control.review = { ...audit(command, clock), reviewBasis: model.getStageReviewBasis(context, stage.id) };
          stage.control.state = 'reviewed'; logText = 'Potwierdzono przegląd etapu: ' + stage.title + '.';
        } else if (command.action === 'reopenStage') {
          const stage = stageFor(context, command.stageId), index = context.stageOrder.indexOf(stage.id); stageId = stage.id;
          if (stage.control.state !== 'reviewed' || context.stageOrder.slice(index + 1).some(nextId => stageFor(context, nextId).control.state !== 'planned')
              || context.stages.some(item => item.control.state === 'active')) fail('CARE_PLAN_STAGE_ORDER');
          if (command.effectiveDateISO < stage.control.review.effectiveDateISO) fail('CARE_PLAN_STAGE_CHRONOLOGY');
          logText = reasonDocument(command.reason, 'Wznowienie etapu', 'decision', stage.id, null);
          stage.control.state = 'active'; stage.control.review = null;
        } else if (command.action === 'setReminder') {
          const step = stepFor(context, command.stepId), stage = stageFor(context, step.stageId); editableStage(context, stage);
          stepId = step.id; stageId = stage.id;
          if (stage.control.state !== 'active') fail('CARE_PLAN_STAGE_NOT_ACTIVE');
          if (command.dateISO !== null && !validDate(command.dateISO, model)
              || command.time !== null && (typeof command.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(command.time))
              || command.dateISO === null && command.time !== null) fail('CARE_PLAN_REMINDER_DATE_INVALID');
          step.reminderSchedule = command.dateISO === null ? null : { dateISO: command.dateISO, time: command.time, origin: 'manual', overrideOperationId: command.operationId };
          logText = 'Zmieniono przypomnienie kroku: ' + step.title + '.';
        } else if (command.action === 'closePlan') {
          if (!text(command.reason, 240, true) || !text(command.text, LIMITS.maxDocumentTextUnits, true)
              || typeof command.confirmOpenWork !== 'boolean') fail('CARE_PLAN_REASON_REQUIRED');
          if (before.stages.some(stage => stage.controlState !== 'reviewed') && !command.confirmOpenWork) fail('CARE_PLAN_OPEN_WORK_CONFIRMATION_REQUIRED');
          const workflowDates = context.facts.map(fact => fact.effectiveDateISO)
            .concat(context.steps.filter(step => step.omission).map(step => step.omission.effectiveDateISO),
              context.stages.flatMap(stage => [stage.control.activation, stage.control.review].filter(Boolean).map(item => item.effectiveDateISO)));
          if (workflowDates.some(date => date > command.effectiveDateISO)) fail('CARE_PLAN_PLAN_CHRONOLOGY');
          reasonDocument(command.text, 'Zakończenie planu', 'decision', null, null);
          context.status = 'closed'; context.closedAtISO = clock.recordedAtISO; context.closeReason = command.reason; context.closeText = command.text;
          logText = command.text;
        } else if (command.action === 'reopenPlan') {
          if (context.status !== 'closed') fail('CARE_PLAN_NOT_CLOSED');
          const previous = context.log.filter(entry => entry.action === 'closePlan').at(-1);
          if (previous && command.effectiveDateISO < previous.effectiveDateISO) fail('CARE_PLAN_PLAN_CHRONOLOGY');
          logText = reasonDocument(command.reason, 'Wznowienie planu', 'decision', null, null);
          context.status = 'active'; context.closedAtISO = null; context.closeReason = ''; context.closeText = '';
        }
        state.record.rev++;
      }
      const fromRevision = currentValue === null ? 0 : command.expectedRevision;
      state.operations.push({ id: command.operationId, intentCanonical, fromRevision, toRevision: state.record.rev, clock });
      state.record.careContext.log.push({ operationId: command.operationId, action: command.action, ...clock,
        effectiveDateISO: command.effectiveDateISO || clock.recordedLocalDateISO, stageId, stepId, documentIds, text: logText });
      checkState(state, model, templates);
      const proposed = projection(state, model, clock.recordedLocalDateISO); assertWorkflow(proposed);
      if (currentValue !== null) {
        const old = reminderProjection(checkState(copy(currentValue), model, templates), model, clock.recordedLocalDateISO);
        const next = reminderProjection(state, model, clock.recordedLocalDateISO);
        for (const [key, desired] of next) {
          const prior = old.get(key), stage = stageFor(state.record.careContext, desired.careContext.stageId);
          if (canonical(prior) !== canonical(desired) && (desired.active || prior.active || stage.control.activation)) documentEffects.push(desired);
        }
      }
      // Re-check the complete combined JSON budget before returning any part of
      // the proposed transaction. No history, fact or document effect is trimmed.
      const result = copy({ ok: true, reused: false, state, preconditions: { planId: command.planId,
        patientId: command.patientId, expectedRevision: command.expectedRevision }, documentEffects, readDependencies, ...flags });
      return freeze(result);
    } catch (error) { return reject(errorCode(error)); }
  }
  root.VildaCarePlanMutation = Object.freeze({ VERSION, FORMAT, LIMITS, validateState: validatedState, prepareTransaction });
})(typeof window !== 'undefined' ? window : globalThis);
