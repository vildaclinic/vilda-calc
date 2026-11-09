// Application coordinator. Only the native closure supplies this service with
// an admitted transactional workspace; neither a UI token nor a model DTO is
// an authorization credential. All clinical effects share one local commit.
const ID = /^[A-Za-z0-9_.-]{1,160}$/;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
function fail(code) { throw Object.assign(new Error('Nie można potwierdzić zapisu planu. Odśwież jego widok i spróbuj ponownie.'), { code }); }
function copy(value, depth = 0, seen = new Set(), budget = { nodes: 0 }) {
  if (++budget.nodes > 100000 || depth > 48) fail('CARE_APPLICATION_LIMIT');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object' || seen.has(value)) fail('CARE_APPLICATION_INVALID');
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== null && Object.getPrototypeOf(prototype) !== null) fail('CARE_APPLICATION_INVALID');
  const keys = Reflect.ownKeys(value), result = Array.isArray(value) ? [] : {};
  if (keys.some(key => typeof key !== 'string') || Array.isArray(value) && Object.keys(value).length !== value.length) fail('CARE_APPLICATION_INVALID');
  seen.add(value);
  for (const key of keys) {
    if (Array.isArray(value) && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !own(descriptor, 'value')) fail('CARE_APPLICATION_INVALID');
    Object.defineProperty(result, key, { value: copy(descriptor.value, depth + 1, seen, budget), enumerable: true, writable: true, configurable: true });
  }
  seen.delete(value); return result;
}
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
function identifier(value) { if (typeof value !== 'string' || !ID.test(value)) fail('CARE_APPLICATION_INVALID'); return value; }
function fields(input, names) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('CARE_APPLICATION_INVALID');
  const result = {};
  for (const key of Reflect.ownKeys(input)) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (typeof key !== 'string' || !names.includes(key) || !descriptor?.enumerable || !own(descriptor, 'value')) fail('CARE_APPLICATION_INVALID');
    result[key] = descriptor.value;
  }
  if (names.some(key => !own(result, key))) fail('CARE_APPLICATION_INVALID');
  return result;
}
function matchesSource(view, source, model) {
  return view && view.status === 'active' && view.readOnly !== true && view.conflicts === null
    && view.templateId === source.templateId && view.headRevisionId === source.revisionId
    && view.revisionId === source.revisionId && view.revisionNumber === source.revisionNumber
    && view.baseToken === source.baseToken && model.sameDefinition(view.definition, source.definition);
}
function recordView(state) {
  const first = state.operations[0], last = state.operations.at(-1);
  return Object.assign(copy(state.record), { createdAtISO: first.clock.recordedAtISO, updatedAtISO: last.clock.recordedAtISO });
}

export function createCarePlanService(options) {
  const { templateModel, mutationModel, readTemplate, listPatients, workspace,
    captureSession, assertSession, newId, clock } = options;
  const drafts = new WeakMap();
  function check(token) { assertSession(token); }
  async function patient(tx, patientId, session) {
    const value = await tx.getPatient(patientId); check(session);
    if (!value || value.patientId !== patientId || value.deleted === true) fail('CARE_APPLICATION_PATIENT_MISSING');
    return value;
  }
  async function outcomeIn(tx, operationId, planId, patientId, session) {
    // Operation IDs are account-wide, including different drafts and patients.
    // Looking only in the requested plan could reinterpret an existing ID as
    // a new write when a caller retries using a newly prepared draft token.
    const states = await tx.listPlans(); check(session);
    let found = null;
    for (const state of states) {
      if (!state) continue;
      const checked = mutationModel.validateState(state);
      if (!checked.ok) fail('CARE_APPLICATION_STATE_INVALID');
      if (!checked.state.operations.some(operation => operation.id === operationId)) continue;
      if (found || planId && checked.state.record.id !== planId || patientId && checked.state.record.patientId !== patientId)
        fail('CARE_APPLICATION_OPERATION_CONFLICT');
      found = checked.state;
    }
    if (found) return { state: 'saved', saved: true, planId: found.record.id, patientId: found.record.patientId, plan: recordView(found) };
    return { state: 'not-saved' };
  }
  async function apply(tx, command, session) {
    await outcomeIn(tx, command.operationId, command.planId, command.patientId, session);
    await patient(tx, command.patientId, session);
    const current = await tx.getPlan(command.planId); check(session);
    const proposed = mutationModel.prepareTransaction(current || null, command, clock());
    if (!proposed.ok) fail(proposed.code);
    if (!proposed.reused) {
      for (const dependency of proposed.readDependencies) {
        const document = await tx.getDocument(dependency.noteId); check(session);
        if (!document || document.patientId !== command.patientId || document.deleted === true
            || document.rev !== dependency.expectedRevision) fail('CARE_APPLICATION_DOCUMENT_CHANGED');
      }
      for (const effect of proposed.documentEffects) { await tx.applyDocumentEffect(effect); check(session); }
      await tx.setPlan(command.planId, proposed.state); check(session);
    }
    return { saved: true, planId: command.planId, patientId: command.patientId, plan: recordView(proposed.state) };
  }
  function validateEdited(definition, retained) {
    const normalized = templateModel.canonicalDefinition(definition);
    if (!normalized.ok || !normalized.definition.steps.length) fail('CARE_APPLICATION_DEFINITION_INVALID');
    const draft = normalized.definition;
    // Patient-specific wording and selections are editable. Authorship and
    // license terms belong to the reviewed immutable template version and may
    // not be removed or replaced by a caller of the application coordinator.
    if (canonical(draft.publication || null) !== canonical(retained.draft.definition.publication || null))
      fail('CARE_APPLICATION_DEFINITION_INVALID');
    const stageOrder = retained.draft.definition.stageOrder.filter(id => draft.stageOrder.includes(id));
    const stepIds = new Set(retained.draft.definition.steps.map(step => step.id));
    if (canonical(stageOrder) !== canonical(draft.stageOrder)
        || draft.steps.some(step => !stepIds.has(step.id)
          || retained.draft.definition.steps.find(original => original.id === step.id).stageId !== step.stageId)) fail('CARE_APPLICATION_DEFINITION_INVALID');
    for (const stage of draft.stages) {
      const original = retained.draft.definition.stages.find(value => value.id === stage.id);
      if (!original || !stage.stepIds.length || canonical(original.stepIds.filter(id => stage.stepIds.includes(id))) !== canonical(stage.stepIds))
        fail('CARE_APPLICATION_DEFINITION_INVALID');
    }
    return draft;
  }
  const application = Object.freeze({
    async getCapability() {
      const session = captureSession();
      const capability = await workspace.getCapability(); check(session);
      return capability.available === true ? { available: true } : { available: false,
        message: capability.message || 'Plany z etapami wymagają przygotowania zapisu i synchronizacji tego konta.' };
    },
    async listPatients() {
      const session = captureSession(); const rows = await listPatients(); check(session);
      return rows.map(row => ({ patientId: identifier(row.patientId), header: copy(row.header) }));
    },
    async prepare(input) {
      const args = fields(input, ['patientId', 'templateId', 'revisionId']);
      Object.values(args).forEach(identifier);
      const session = captureSession();
      const capability = await workspace.getCapability(); check(session);
      if (capability.available !== true) fail('CARE_APPLICATION_UNAVAILABLE');
      const view = await readTemplate(args.templateId, args.revisionId); check(session);
      if (!view || view.templateId !== args.templateId || view.revisionId !== args.revisionId) fail('CARE_APPLICATION_TEMPLATE_CHANGED');
      const checked = templateModel.canonicalDefinition(view.definition);
      if (!checked.ok) fail('CARE_APPLICATION_TEMPLATE_CHANGED');
      const definition = checked.definition, stageIds = {}, stepIds = {};
      definition.stageOrder.forEach(id => { stageIds[id] = newId(); });
      definition.steps.forEach(step => { stepIds[step.id] = newId(); });
      const draft = templateModel.prepareApplicationDraft(view, {
        selectedStepIds: definition.steps.map(step => step.id), stageIds, stepIds });
      if (!draft.ok) fail('CARE_APPLICATION_TEMPLATE_CHANGED');
      await workspace.read(async tx => { await patient(tx, args.patientId, session); }); check(session);
      const token = Object.freeze({});
      drafts.set(token, { args: copy(args), session, draft: copy(draft), planId: newId(),
        reminders: Object.fromEntries(draft.definition.steps.map(step => [step.id, newId()])), request: null });
      return { token, definition: copy(draft.definition) };
    },
    async commit(input) {
      const args = fields(input, ['operationId', 'token', 'patientId', 'templateId', 'revisionId', 'definition']);
      identifier(args.operationId);
      const retained = drafts.get(args.token);
      if (!retained || ['patientId', 'templateId', 'revisionId'].some(key => args[key] !== retained.args[key])) fail('CARE_APPLICATION_DRAFT_EXPIRED');
      check(retained.session);
      const definition = validateEdited(copy(args.definition), retained);
      const request = { operationId: args.operationId, patientId: args.patientId, definition };
      if (retained.request && canonical(request) !== canonical(retained.request)) fail('CARE_APPLICATION_OPERATION_CONFLICT');
      // Retain exact IDs and edited values before yielding. Unknown outcomes can
      // only be reconciled or retried using this same command.
      retained.request = copy(request);
      return workspace.transact(args.operationId, async tx => {
        check(retained.session);
        const found = await outcomeIn(tx, args.operationId, retained.planId, args.patientId, retained.session);
        if (found.state === 'saved') return found;
        const view = await readTemplate(args.templateId, args.revisionId); check(retained.session);
        if (!matchesSource(view, retained.draft.source, templateModel)) fail('CARE_APPLICATION_TEMPLATE_CHANGED');
        const result = await apply(tx, { action: 'createFromTemplate', operationId: args.operationId,
          planId: retained.planId, patientId: args.patientId, expectedRevision: null,
          draft: { source: retained.draft.source, definition },
          documentIds: { reminders: Object.fromEntries(definition.steps.map(step => [step.id, retained.reminders[step.id]])) } }, retained.session);
        const finalSource = await readTemplate(args.templateId, args.revisionId); check(retained.session);
        if (!matchesSource(finalSource, retained.draft.source, templateModel)) fail('CARE_APPLICATION_TEMPLATE_CHANGED');
        return result;
      });
    },
    async getOutcome(input) {
      const args = fields(input, ['operationId', 'token', 'patientId']); identifier(args.operationId); identifier(args.patientId);
      const retained = drafts.get(args.token);
      if (!retained || retained.args.patientId !== args.patientId) fail('CARE_APPLICATION_DRAFT_EXPIRED');
      if (!retained.request || retained.request.operationId !== args.operationId) fail('CARE_APPLICATION_OPERATION_CONFLICT');
      check(retained.session);
      return workspace.read(tx => outcomeIn(tx, args.operationId, retained.planId, args.patientId, retained.session));
    }
  });
  return Object.freeze({
    application,
    async mutate(input) {
      const command = copy(input); identifier(command.operationId);
      if (command.action === 'createFromTemplate') fail('CARE_APPLICATION_DRAFT_REQUIRED');
      const session = captureSession();
      return workspace.transact(command.operationId, tx => apply(tx, command, session));
    },
    async getOperation(input) {
      const args = fields(input, ['operationId', 'planId', 'patientId']); Object.values(args).forEach(identifier);
      const session = captureSession();
      return workspace.read(tx => outcomeIn(tx, args.operationId, args.planId, args.patientId, session));
    },
    async get(planId) {
      identifier(planId); const session = captureSession();
      return workspace.read(async tx => {
        const state = await tx.getPlan(planId); check(session); if (!state) return null;
        if (!mutationModel.validateState(state).ok) fail('CARE_APPLICATION_STATE_INVALID');
        await patient(tx, state.record.patientId, session); return recordView(state);
      });
    },
    async list(options = {}) {
      const patientId = options.patientId == null ? null : identifier(options.patientId), session = captureSession();
      return workspace.read(async tx => {
        const states = await tx.listPlans(); check(session); const result = [];
        for (const state of states) {
          if (!mutationModel.validateState(state).ok) fail('CARE_APPLICATION_STATE_INVALID');
          if (patientId && state.record.patientId !== patientId) continue;
          const currentPatient = await tx.getPatient(state.record.patientId); check(session);
          if (currentPatient && currentPatient.deleted !== true) result.push(recordView(state));
        }
        return result.sort((a, b) => b.updatedAtISO.localeCompare(a.updatedAtISO));
      });
    }
  });
}
