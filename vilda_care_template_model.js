/* Private care-template definitions and immutable operation graphs.
 * Pure data only: no storage, network, DOM, clock, random IDs or patient writes.
 * SHA verification checks internal consistency; account authority belongs to the
 * guarded provider. A template is a reusable instruction, never a clinical fact.
 */
(function (root) {
  'use strict';
  if (!root) return;

  const DOMAIN = 'care-template-library', VERSION = 1;
  // The operation ID is also the immutable transport EID. Keep its grammar
  // distinct from local template/stage/step/revision identities.
  const OP_ID_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$';
  const OP_ID = new RegExp(OP_ID_PATTERN);
  const LIMITS = Object.freeze({
    maxStages: 32, maxStepsPerStage: 64, maxSteps: 256, maxLabels: 20,
    maxLabelUnits: 80, maxNameUnits: 240, maxKindUnits: 80,
    maxPurposeUnits: 20000, maxInstructionUnits: 20000,
    maxDefinitionTextUnits: 262144, maxDefinitionBytes: 262144,
    maxOperationPlainBytes: 524288, maxEncryptedWireBytes: 1048576,
    maxRevisions: 64, maxOperations: 2048, maxParents: 64, maxEdges: 16384,
    maxAggregateBytes: 16777216, serverAccountBytes: 67108864, serverAccountEvents: 16384
  });
  const TASK_KINDS = Object.freeze([
    ['examination', 'Badanie'], ['followup', 'Kontrola'], ['consultation', 'Konsultacja'],
    ['hospitalization', 'Hospitalizacja'], ['documentation', 'Dokumentacja'],
    ['referral', 'Skierowanie'], ['contact', 'Kontakt'], ['other', 'Inny krok']
  ].map(pair => Object.freeze({ value: pair[0], label: pair[1] })));
  const OUTCOMES = Object.freeze([
    ['performance', 'Potwierdzenie wykonania'], ['resultReceipt', 'Otrzymanie wyniku'],
    ['decision', 'Zapisanie decyzji']
  ].map(pair => Object.freeze({ value: pair[0], label: pair[1] })));
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const id = value => typeof value === 'string' && /^[A-Za-z0-9_.-]{1,160}$/.test(value);
  const validateOperationId = value => typeof value === 'string' && OP_ID.test(value);
  const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  const cleanText = value => value.replace(/\r\n?/g, '\n').trim();
  const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
  const equal = (left, right) => canonical(left) === canonical(right);

  // Safe detached JSON, including unknown versions. Accessors, cycles and sparse
  // arrays are rejected rather than invoked or silently dropped. Reader limits
  // do not truncate a definition, graph, receipt or unknown payload.
  function detached(value) {
    let nodes = 0, units = 0;
    const ancestors = new Set();
    function visit(item, depth) {
      if (++nodes > 1000000 || depth > 48) throw new Error('CARE_TEMPLATE_LIMIT');
      if (item === null || typeof item === 'boolean') return item;
      if (typeof item === 'number' && Number.isFinite(item)) return item;
      if (typeof item === 'string') {
        if ((units += item.length) > LIMITS.maxAggregateBytes) throw new Error('CARE_TEMPLATE_LIMIT');
        return item;
      }
      if (!item || typeof item !== 'object' || ancestors.has(item)) throw new Error('CARE_TEMPLATE_JSON_INVALID');
      const prototype = Object.getPrototypeOf(item);
      // Plain objects from another frame are valid too. Do not call toString:
      // Symbol.toStringTag itself could be an accessor on untrusted input.
      if (!Array.isArray(item) && prototype !== null && Object.getPrototypeOf(prototype) !== null) throw new Error('CARE_TEMPLATE_JSON_INVALID');
      const keys = Reflect.ownKeys(item);
      if (keys.some(key => typeof key !== 'string' || (!Object.getOwnPropertyDescriptor(item, key).enumerable && !(Array.isArray(item) && key === 'length')))) throw new Error('CARE_TEMPLATE_JSON_INVALID');
      if (Array.isArray(item) && (Object.keys(item).length !== item.length || Object.keys(item).some((key, index) => key !== String(index)))) throw new Error('CARE_TEMPLATE_JSON_INVALID');
      ancestors.add(item);
      const result = Array.isArray(item) ? [] : {};
      for (const key of Object.keys(item)) {
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (!descriptor || !own(descriptor, 'value')) throw new Error('CARE_TEMPLATE_JSON_INVALID');
        if ((units += key.length) > LIMITS.maxAggregateBytes) throw new Error('CARE_TEMPLATE_LIMIT');
        Object.defineProperty(result, key, { value: visit(descriptor.value, depth + 1), enumerable: true, configurable: true, writable: true });
      }
      ancestors.delete(item);
      return result;
    }
    return visit(value, 0);
  }
  function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (object(value)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
    return JSON.stringify(value);
  }
  function byteLength(value) {
    let length = 0;
    for (let index = 0; index < value.length; index++) {
      const code = value.charCodeAt(index);
      if (code < 0x80) length++;
      else if (code < 0x800) length += 2;
      else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length && value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) { length += 4; index++; }
      else length += 3;
    }
    return length;
  }
  function utf8(value) {
    const bytes = new Uint8Array(byteLength(value)); let position = 0;
    for (let index = 0; index < value.length; index++) {
      let code = value.charCodeAt(index);
      if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length && value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) code = 0x10000 + ((code - 0xd800) << 10) + value.charCodeAt(++index) - 0xdc00;
      else if (code >= 0xd800 && code <= 0xdfff) code = 0xfffd;
      if (code < 0x80) bytes[position++] = code;
      else if (code < 0x800) { bytes[position++] = 0xc0 | code >> 6; bytes[position++] = 0x80 | code & 63; }
      else if (code < 0x10000) { bytes[position++] = 0xe0 | code >> 12; bytes[position++] = 0x80 | code >> 6 & 63; bytes[position++] = 0x80 | code & 63; }
      else { bytes[position++] = 0xf0 | code >> 18; bytes[position++] = 0x80 | code >> 12 & 63; bytes[position++] = 0x80 | code >> 6 & 63; bytes[position++] = 0x80 | code & 63; }
    }
    return bytes;
  }
  async function sha(scope, value) {
    if (!root.crypto || !root.crypto.subtle) throw new Error('CARE_TEMPLATE_CRYPTO_UNAVAILABLE');
    const result = await root.crypto.subtle.digest('SHA-256', utf8(DOMAIN + '/' + scope + '\n' + canonical(value)));
    return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  function add(issues, code, path, context) {
    if (issues.length >= 256) return;
    const result = { code, path: path.slice(), fieldPath: path.map(String).join('.') };
    if (context && id(context.stageId)) result.stageId = context.stageId;
    if (context && id(context.stepId)) result.stepId = context.stepId;
    issues.push(result);
  }
  function fields(value, allowed, path, issues, context) {
    if (!object(value)) { add(issues, 'CARE_TEMPLATE_OBJECT_REQUIRED', path, context); return false; }
    Object.keys(value).forEach(key => { if (!allowed.includes(key)) add(issues, 'CARE_TEMPLATE_UNSUPPORTED_FIELD', path.concat(key), context); });
    return true;
  }
  function textField(value, maximum, required, path, issues, context) {
    if (typeof value !== 'string') { add(issues, 'CARE_TEMPLATE_TEXT_REQUIRED', path, context); return false; }
    const text = cleanText(value);
    if (text.length > maximum) add(issues, 'CARE_TEMPLATE_TEXT_LIMIT', path, context);
    if (required && !text) add(issues, 'CARE_TEMPLATE_TEXT_REQUIRED', path, context);
    return true;
  }
  function idField(value, path, issues, context) { if (!id(value)) add(issues, 'CARE_TEMPLATE_ID_INVALID', path, context); }
  function operationIdField(value, path, issues) { if (!validateOperationId(value)) add(issues, 'CARE_TEMPLATE_OPERATION_ID_INVALID', path); }
  function list(value, maximum, minimum, path, issues, context) {
    if (!Array.isArray(value)) { add(issues, 'CARE_TEMPLATE_ARRAY_REQUIRED', path, context); return false; }
    if (value.length < minimum) add(issues, 'CARE_TEMPLATE_EMPTY', path, context);
    if (value.length > maximum) add(issues, 'CARE_TEMPLATE_LIMIT', path, context);
    return true;
  }
  function instant(value) {
    if (typeof value !== 'string') return false;
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?Z$/.exec(value);
    if (!match) return false;
    const year = +match[1], month = +match[2], day = +match[3];
    const days = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return year >= 1900 && year <= 2999 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1] && +match[4] < 24 && +match[5] < 60 && +match[6] < 60;
  }

  function checkDefinition(value, section) {
    const issues = [];
    if (!fields(value, ['contentVersion', 'name', 'purpose', 'labels', 'stageOrder', 'stages', 'steps'], [], issues)) return issues;
    if (value.contentVersion !== VERSION) add(issues, 'CARE_TEMPLATE_VERSION_UNSUPPORTED', ['contentVersion']);
    if (section !== 'structure') {
      textField(value.name, LIMITS.maxNameUnits, true, ['name'], issues);
      textField(value.purpose, LIMITS.maxPurposeUnits, false, ['purpose'], issues);
      if (list(value.labels, LIMITS.maxLabels, 0, ['labels'], issues)) {
        const labels = new Set();
        value.labels.forEach((label, index) => {
          if (textField(label, LIMITS.maxLabelUnits, true, ['labels', index], issues)) {
            if (labels.has(cleanText(label))) add(issues, 'CARE_TEMPLATE_DUPLICATE_LABEL', ['labels', index]);
            labels.add(cleanText(label));
          }
        });
      }
    }
    if (section !== 'name') {
      const stageIds = new Set(), stepIds = new Set(), declared = new Map(), placed = new Set();
      if (list(value.stages, LIMITS.maxStages, 1, ['stages'], issues)) value.stages.forEach((stage, index) => {
        const path = ['stages', index], context = { stageId: stage && stage.id };
        if (!fields(stage, ['id', 'title', 'stepIds'], path, issues, context)) return;
        idField(stage.id, path.concat('id'), issues, context);
        if (stageIds.has(stage.id)) add(issues, 'CARE_TEMPLATE_DUPLICATE_ID', path.concat('id'), context);
        stageIds.add(stage.id);
        textField(stage.title, LIMITS.maxNameUnits, true, path.concat('title'), issues, context);
        if (list(stage.stepIds, LIMITS.maxStepsPerStage, 1, path.concat('stepIds'), issues, context)) stage.stepIds.forEach((stepId, position) => {
          idField(stepId, path.concat('stepIds', position), issues, context);
          if (declared.has(stepId)) add(issues, 'CARE_TEMPLATE_STEP_PLACEMENT', path.concat('stepIds', position), context);
          declared.set(stepId, stage.id);
        });
      });
      if (list(value.stageOrder, LIMITS.maxStages, 1, ['stageOrder'], issues)) {
        const seen = new Set();
        value.stageOrder.forEach((stageId, index) => {
          idField(stageId, ['stageOrder', index], issues);
          if (!stageIds.has(stageId) || seen.has(stageId)) add(issues, 'CARE_TEMPLATE_STAGE_ORDER', ['stageOrder', index]);
          seen.add(stageId);
        });
        if (seen.size !== stageIds.size) add(issues, 'CARE_TEMPLATE_STAGE_ORDER', ['stageOrder']);
      }
      if (list(value.steps, LIMITS.maxSteps, 1, ['steps'], issues)) value.steps.forEach((step, index) => {
        const path = ['steps', index], context = { stageId: step && step.stageId, stepId: step && step.id };
        if (!fields(step, ['id', 'stageId', 'title', 'taskKind', 'instruction', 'requiredOutcome', 'reminderRule', 'includedByDefault'], path, issues, context)) return;
        idField(step.id, path.concat('id'), issues, context); idField(step.stageId, path.concat('stageId'), issues, context);
        if (stepIds.has(step.id) || stageIds.has(step.id)) add(issues, 'CARE_TEMPLATE_DUPLICATE_ID', path.concat('id'), context);
        stepIds.add(step.id);
        if (!stageIds.has(step.stageId) || declared.get(step.id) !== step.stageId) add(issues, 'CARE_TEMPLATE_STEP_PLACEMENT', path.concat('stageId'), context);
        placed.add(step.id);
        textField(step.title, LIMITS.maxNameUnits, true, path.concat('title'), issues, context);
        textField(step.instruction, LIMITS.maxInstructionUnits, false, path.concat('instruction'), issues, context);
        if (!TASK_KINDS.some(kind => kind.value === step.taskKind)) add(issues, 'CARE_TEMPLATE_TASK_KIND_REQUIRED', path.concat('taskKind'), context);
        if (!OUTCOMES.some(outcome => outcome.value === step.requiredOutcome)) add(issues, 'CARE_TEMPLATE_OUTCOME_REQUIRED', path.concat('requiredOutcome'), context);
        if (typeof step.includedByDefault !== 'boolean') add(issues, 'CARE_TEMPLATE_BOOLEAN_REQUIRED', path.concat('includedByDefault'), context);
        const rule = step.reminderRule, rulePath = path.concat('reminderRule');
        if (fields(rule, rule && rule.kind === 'stage-offset' ? ['kind', 'amount', 'unit'] : ['kind'], rulePath, issues, context)) {
          if (rule.kind === 'stage-offset') {
            if (!Number.isInteger(rule.amount) || rule.amount < 0 || rule.amount > 1200) add(issues, 'CARE_TEMPLATE_OFFSET_REQUIRED', rulePath.concat('amount'), context);
            if (!['day', 'week', 'month'].includes(rule.unit)) add(issues, 'CARE_TEMPLATE_OFFSET_UNIT_REQUIRED', rulePath.concat('unit'), context);
          } else if (rule.kind !== 'none') add(issues, 'CARE_TEMPLATE_REMINDER_KIND_REQUIRED', rulePath.concat('kind'), context);
        }
      });
      if (Array.from(declared.keys()).some(stepId => !placed.has(stepId))) add(issues, 'CARE_TEMPLATE_STEP_PLACEMENT', ['steps']);
    }
    return issues;
  }
  function normalizedDefinition(value) {
    return {
      contentVersion: VERSION, name: cleanText(value.name), purpose: cleanText(value.purpose), labels: value.labels.map(cleanText),
      stageOrder: value.stageOrder.slice(),
      stages: value.stages.map(stage => ({ id: stage.id, title: cleanText(stage.title), stepIds: stage.stepIds.slice() })),
      steps: value.steps.map(step => ({ id: step.id, stageId: step.stageId, title: cleanText(step.title), taskKind: step.taskKind,
        instruction: cleanText(step.instruction), requiredOutcome: step.requiredOutcome, reminderRule: detached(step.reminderRule), includedByDefault: step.includedByDefault }))
    };
  }
  function definitionResult(value, section) {
    let input;
    try { input = detached(value); } catch (error) { return { valid: false, issues: [{ code: error.message, path: [], fieldPath: '' }] }; }
    const issues = checkDefinition(input, section);
    if (section === 'all' && !issues.length) {
      const definition = normalizedDefinition(input), encoded = canonical(definition);
      let units = definition.name.length + definition.purpose.length + definition.labels.reduce((total, label) => total + label.length, 0);
      units += definition.stages.reduce((total, stage) => total + stage.title.length, 0);
      units += definition.steps.reduce((total, step) => total + step.title.length + step.instruction.length, 0);
      if (units > LIMITS.maxDefinitionTextUnits || byteLength(encoded) > LIMITS.maxDefinitionBytes) add(issues, 'CARE_TEMPLATE_DEFINITION_LIMIT', []);
    }
    return { valid: issues.length === 0, issues };
  }
  function validateDraft(value, options) { return definitionResult(value, options && ['name', 'structure'].includes(options.section) ? options.section : 'all'); }
  function validateDefinition(value) { return definitionResult(value, 'all'); }
  function canonicalDefinition(value) {
    const validation = validateDefinition(value);
    if (!validation.valid) return { ok: false, issues: validation.issues };
    const definition = normalizedDefinition(value);
    return { ok: true, definition, canonical: canonical(definition), issues: [] };
  }
  function sameDefinition(left, right) {
    const first = canonicalDefinition(left), second = canonicalDefinition(right);
    return first.ok && second.ok && first.canonical === second.canonical;
  }
  function draftFailure(code) { return { ok: false, requiresNameReview: false, issues: [{ code, path: [], fieldPath: '' }] }; }
  function createDefinitionDraft(options) {
    try { options = detached(options); } catch (error) { return draftFailure(error.message); }
    if (!options || !id(options.stageId) || !id(options.stepId) || options.stageId === options.stepId) return draftFailure('CARE_TEMPLATE_ID_INVALID');
    const stageId = options.stageId, stepId = options.stepId;
    return { ok: true, requiresNameReview: false, issues: [], definition: { contentVersion: VERSION, name: '', purpose: '', labels: [], stageOrder: [stageId],
      stages: [{ id: stageId, title: '', stepIds: [stepId] }], steps: [{ id: stepId, stageId, title: '', taskKind: 'other', instruction: '', requiredOutcome: null, reminderRule: { kind: 'none' }, includedByDefault: true }] } };
  }
  function duplicateDefinition(value, options) {
    const source = canonicalDefinition(value);
    if (!source.ok) return { ok: false, requiresNameReview: false, issues: source.issues };
    try { options = detached(options); } catch (error) { return draftFailure(error.message); }
    if (!options || !object(options.stageIds) || !object(options.stepIds)) return draftFailure('CARE_TEMPLATE_ID_MAP_REQUIRED');
    const original = new Set(source.definition.stageOrder.concat(source.definition.steps.map(step => step.id))), replacement = new Set();
    for (const oldId of original) {
      const mapping = source.definition.stageOrder.includes(oldId) ? options.stageIds : options.stepIds;
      const next = own(mapping, oldId) ? mapping[oldId] : null;
      if (!id(next) || original.has(next) || replacement.has(next)) return draftFailure('CARE_TEMPLATE_ID_MAP_INVALID');
      replacement.add(next);
    }
    if (Object.keys(options.stageIds).length !== source.definition.stages.length || Object.keys(options.stepIds).length !== source.definition.steps.length) return draftFailure('CARE_TEMPLATE_ID_MAP_INVALID');
    const definition = source.definition;
    definition.stageOrder = definition.stageOrder.map(stageId => options.stageIds[stageId]);
    definition.stages = definition.stages.map(stage => ({ id: options.stageIds[stage.id], title: stage.title, stepIds: stage.stepIds.map(stepId => options.stepIds[stepId]) }));
    definition.steps = definition.steps.map(step => Object.assign({}, step, { id: options.stepIds[step.id], stageId: options.stageIds[step.stageId] }));
    return { ok: true, definition, requiresNameReview: false, issues: [] };
  }
  function copyPatientStructureDraft(source, options) {
    let plan;
    try { plan = detached(source); } catch (error) { return draftFailure(error.message); }
    try { options = detached(options); } catch (error) { return draftFailure(error.message); }
    // Accept the V1 context itself or an actual note envelope, never V2. Whitelist
    // construction below deliberately does not spread a patient object.
    const context = plan && object(plan.careContext) ? plan.careContext : plan;
    if (!object(context) || context.version !== 1 || context.role !== 'plan' || !Array.isArray(context.steps) || !context.steps.length || context.steps.length > LIMITS.maxStepsPerStage) return draftFailure('CARE_TEMPLATE_PATIENT_STRUCTURE_UNSUPPORTED');
    if (!options || !id(options.legacyStageId) || !object(options.stepIds)) return draftFailure('CARE_TEMPLATE_ID_MAP_REQUIRED');
    const originals = new Set(context.steps.map(step => step && step.id)), nextIds = new Set([options.legacyStageId]);
    const kinds = { badanie: 'examination', kontrola: 'followup', konsultacja: 'consultation', hospitalizacja: 'hospitalization', dokumentacja: 'documentation', skierowanie: 'referral', kontakt: 'contact', inne: 'other', inny: 'other' };
    const steps = [];
    for (const step of context.steps) {
      if (!object(step) || !id(step.id) || !own(options.stepIds, step.id) || !id(options.stepIds[step.id]) || originals.has(options.stepIds[step.id]) || nextIds.has(options.stepIds[step.id]) || typeof step.title !== 'string') return draftFailure('CARE_TEMPLATE_ID_MAP_INVALID');
      const stepId = options.stepIds[step.id]; nextIds.add(stepId);
      const originalKind = typeof step.kind === 'string' ? step.kind : '';
      const mappedKind = originalKind.toLowerCase();
      const taskKind = TASK_KINDS.some(kind => kind.value === originalKind) ? originalKind : own(kinds, mappedKind) ? kinds[mappedKind] : 'other';
      steps.push({ id: stepId, stageId: options.legacyStageId, title: step.title, taskKind, instruction: '', requiredOutcome: null, reminderRule: { kind: 'none' }, includedByDefault: true });
    }
    if (originals.size !== context.steps.length || Object.keys(options.stepIds).length !== steps.length || originals.has(options.legacyStageId)) return draftFailure('CARE_TEMPLATE_ID_MAP_INVALID');
    return { ok: true, requiresNameReview: true, issues: [], definition: { contentVersion: VERSION, name: '', purpose: '', labels: [], stageOrder: [options.legacyStageId],
      stages: [{ id: options.legacyStageId, title: 'Etap', stepIds: steps.map(step => step.id) }], steps } };
  }
  function reviewTextKey(value) {
    let input;
    try { input = detached(value); } catch (_) { return null; }
    if (!object(input) || !Array.isArray(input.stages) || !Array.isArray(input.steps)) return null;
    return canonical({ name: input.name, purpose: input.purpose, labels: input.labels,
      stages: input.stages.map(stage => stage && stage.title), steps: input.steps.map(step => step && [step.title, step.instruction]) });
  }

  function sortedRecord(value) {
    const record = detached(value);
    record.revisions.sort((left, right) => compare(left.id, right.id));
    record.operations.sort((left, right) => compare(left.id, right.id));
    return record;
  }
  function checkRevision(revision, index, issues) {
    const path = ['revisions', index];
    if (!fields(revision, ['id', 'parentRevisionId', 'definition', 'contentDigest', 'operationId', 'recordedAtISO'], path, issues)) return;
    idField(revision.id, path.concat('id'), issues); operationIdField(revision.operationId, path.concat('operationId'), issues);
    if (revision.parentRevisionId !== null) idField(revision.parentRevisionId, path.concat('parentRevisionId'), issues);
    if (!digest(revision.contentDigest)) add(issues, 'CARE_TEMPLATE_DIGEST_INVALID', path.concat('contentDigest'));
    if (!instant(revision.recordedAtISO)) add(issues, 'CARE_TEMPLATE_INSTANT_INVALID', path.concat('recordedAtISO'));
    const definition = canonicalDefinition(revision.definition);
    if (!definition.ok) definition.issues.forEach(item => add(issues, item.code, path.concat('definition').concat(item.path)));
    else if (!equal(definition.definition, revision.definition)) add(issues, 'CARE_TEMPLATE_NONCANONICAL', path.concat('definition'));
  }
  function checkOperation(operation, index, issues) {
    const path = ['operations', index];
    if (!fields(operation, ['id', 'parents', 'fingerprint', 'kind', 'recordedAtISO', 'intent', 'headRevisionId', 'archived', 'outcome', 'nodeDigest'], path, issues)) return;
    operationIdField(operation.id, path.concat('id'), issues);
    if (list(operation.parents, LIMITS.maxParents, 0, path.concat('parents'), issues)) {
      const unique = new Set();
      operation.parents.forEach((parent, position) => {
        operationIdField(parent, path.concat('parents', position), issues);
        if (parent === operation.id || unique.has(parent)) add(issues, 'CARE_TEMPLATE_GRAPH_INVALID', path.concat('parents', position));
        unique.add(parent);
      });
      if (!equal(operation.parents, operation.parents.slice().sort())) add(issues, 'CARE_TEMPLATE_NONCANONICAL', path.concat('parents'));
    }
    if (!['create', 'revise', 'archive', 'resolve', 'noop'].includes(operation.kind)) add(issues, 'CARE_TEMPLATE_OPERATION_INVALID', path.concat('kind'));
    if (!digest(operation.fingerprint) || !digest(operation.nodeDigest)) add(issues, 'CARE_TEMPLATE_DIGEST_INVALID', path);
    if (!instant(operation.recordedAtISO)) add(issues, 'CARE_TEMPLATE_INSTANT_INVALID', path.concat('recordedAtISO'));
    const intent = operation.intent;
    if (fields(intent, ['action', 'templateId', 'baseToken', 'definitionDigest', 'headRevisionId', 'archived'], path.concat('intent'), issues)) {
      idField(intent.templateId, path.concat('intent', 'templateId'), issues);
      if (intent.baseToken !== null && !digest(intent.baseToken)) add(issues, 'CARE_TEMPLATE_DIGEST_INVALID', path.concat('intent', 'baseToken'));
      const allowed = { save: ['action', 'templateId', 'baseToken', 'definitionDigest'], archive: ['action', 'templateId', 'baseToken', 'archived'], resolve: ['action', 'templateId', 'baseToken', 'headRevisionId', 'archived'] }[intent.action];
      if (!allowed) add(issues, 'CARE_TEMPLATE_INTENT_INVALID', path.concat('intent', 'action'));
      else {
        Object.keys(intent).forEach(key => { if (!allowed.includes(key)) add(issues, 'CARE_TEMPLATE_INTENT_INVALID', path.concat('intent', key)); });
        if (intent.action === 'save' && !digest(intent.definitionDigest)) add(issues, 'CARE_TEMPLATE_DIGEST_INVALID', path.concat('intent', 'definitionDigest'));
        if (intent.action === 'resolve') idField(intent.headRevisionId, path.concat('intent', 'headRevisionId'), issues);
        if (intent.action !== 'save' && typeof intent.archived !== 'boolean') add(issues, 'CARE_TEMPLATE_BOOLEAN_REQUIRED', path.concat('intent', 'archived'));
      }
    }
    if (own(operation, 'headRevisionId')) idField(operation.headRevisionId, path.concat('headRevisionId'), issues);
    if (own(operation, 'archived') && typeof operation.archived !== 'boolean') add(issues, 'CARE_TEMPLATE_BOOLEAN_REQUIRED', path.concat('archived'));
    if (fields(operation.outcome, ['headRevisionId', 'archived', 'noOp'], path.concat('outcome'), issues)) {
      idField(operation.outcome.headRevisionId, path.concat('outcome', 'headRevisionId'), issues);
      if (typeof operation.outcome.archived !== 'boolean' || typeof operation.outcome.noOp !== 'boolean') add(issues, 'CARE_TEMPLATE_BOOLEAN_REQUIRED', path.concat('outcome'));
    }
  }
  function structure(value) {
    const issues = [];
    if (!fields(value, ['domain', 'version', 'templateId', 'revisions', 'operations'], [], issues)) return issues;
    if (value.domain !== DOMAIN || value.version !== VERSION) add(issues, 'CARE_TEMPLATE_VERSION_UNSUPPORTED', []);
    idField(value.templateId, ['templateId'], issues);
    if (list(value.revisions, LIMITS.maxRevisions, 0, ['revisions'], issues)) value.revisions.forEach((revision, index) => checkRevision(revision, index, issues));
    if (list(value.operations, LIMITS.maxOperations, 1, ['operations'], issues)) value.operations.forEach((operation, index) => checkOperation(operation, index, issues));
    if (Array.isArray(value.operations) && value.operations.reduce((total, operation) => total + (operation && Array.isArray(operation.parents) ? operation.parents.length : 0), 0) > LIMITS.maxEdges) add(issues, 'CARE_TEMPLATE_LIMIT', ['operations']);
    for (const key of ['revisions', 'operations']) if (Array.isArray(value[key])) {
      const seen = new Set();
      value[key].forEach((item, index) => { if (object(item)) { if (seen.has(item.id)) add(issues, 'CARE_TEMPLATE_IMMUTABLE_COLLISION', [key, index, 'id']); seen.add(item.id); } });
    }
    return issues;
  }
  function failure(kind, raw, issues, record) { const result = { ok: false, kind, raw, issues, readOnly: true }; if (record) result.record = record; return result; }
  function decodeTemplateRecord(value) {
    let raw;
    try { raw = detached(value); } catch (error) { return failure(error.message === 'CARE_TEMPLATE_LIMIT' ? 'limited' : 'invalid', null, [{ code: error.message, path: [], fieldPath: '' }]); }
    if (byteLength(canonical(raw)) > LIMITS.maxAggregateBytes) return failure('limited', raw, [{ code: 'CARE_TEMPLATE_LIMIT', path: [], fieldPath: '' }]);
    if (object(raw) && (raw.domain !== DOMAIN || raw.version !== VERSION)) return failure('unsupported', raw, [{ code: 'CARE_TEMPLATE_VERSION_UNSUPPORTED', path: [], fieldPath: '' }]);
    const issues = structure(raw);
    if (issues.length) {
      const kind = issues.some(item => item.code === 'CARE_TEMPLATE_UNSUPPORTED_FIELD' || item.code === 'CARE_TEMPLATE_VERSION_UNSUPPORTED') ? 'unsupported' : issues.some(item => item.code === 'CARE_TEMPLATE_LIMIT' || item.code === 'CARE_TEMPLATE_DEFINITION_LIMIT') ? 'limited' : 'invalid';
      return failure(kind, raw, issues);
    }
    return { ok: true, kind: 'template', record: sortedRecord(raw), raw, issues: [], readOnly: true };
  }

  function graph(record) {
    const operations = new Map(record.operations.map(operation => [operation.id, operation]));
    const revisions = new Map(record.revisions.map(revision => [revision.id, revision]));
    const ancestors = new Map(), complete = new Map(), frontiers = new Map(), parentFrontiers = new Map();
    const missing = new Set(), pending = new Set(operations.keys()), order = [];
    while (pending.size) {
      let progressed = false;
      for (const operationId of Array.from(pending).sort()) {
        const operation = operations.get(operationId);
        if (operation.parents.some(parent => operations.has(parent) && !ancestors.has(parent))) continue;
        const parents = new Set(); let all = true;
        for (const parent of operation.parents) {
          parents.add(parent);
          if (!operations.has(parent)) { missing.add('operation:' + parent); all = false; }
          else { for (const ancestor of ancestors.get(parent)) parents.add(ancestor); if (!complete.get(parent)) all = false; }
        }
        ancestors.set(operationId, parents); complete.set(operationId, all);
        const candidates = new Set();
        for (const parent of operation.parents) if (frontiers.has(parent)) for (const writer of frontiers.get(parent)) candidates.add(writer);
        const frontier = Array.from(candidates).filter(writer => !Array.from(candidates).some(other => other !== writer && ancestors.get(other).has(writer))).sort();
        parentFrontiers.set(operationId, frontier);
        frontiers.set(operationId, operation.kind === 'noop' ? frontier : [operationId]);
        order.push(operationId); pending.delete(operationId); progressed = true;
      }
      if (!progressed) return { invalid: true, operations, revisions, missing };
    }
    for (const revision of revisions.values()) {
      if (revision.parentRevisionId !== null && !revisions.has(revision.parentRevisionId)) missing.add('revision:' + revision.parentRevisionId);
      if (!operations.has(revision.operationId)) missing.add('operation:' + revision.operationId);
    }
    for (const operation of operations.values()) {
      for (const reference of [operation.headRevisionId, operation.outcome.headRevisionId]) if (reference && !revisions.has(reference)) missing.add('revision:' + reference);
    }
    const tips = new Set(operations.keys());
    for (const operation of operations.values()) for (const parent of operation.parents) tips.delete(parent);
    const candidates = new Set();
    for (const tip of tips) for (const writer of frontiers.get(tip)) candidates.add(writer);
    const frontier = Array.from(candidates).filter(writer => !Array.from(candidates).some(other => other !== writer && ancestors.get(other).has(writer))).sort();
    return { operations, revisions, ancestors, complete, order, missing, parentFrontiers, frontier, invalid: false };
  }
  function semanticState(graphData, frontier) {
    const heads = new Map(), archives = new Map();
    for (const operationId of frontier) {
      const outcome = graphData.operations.get(operationId).outcome;
      if (!heads.has(outcome.headRevisionId)) heads.set(outcome.headRevisionId, []);
      heads.get(outcome.headRevisionId).push(operationId);
      if (!archives.has(outcome.archived)) archives.set(outcome.archived, []);
      archives.get(outcome.archived).push(operationId);
    }
    const needsReview = heads.size !== 1 || archives.size !== 1;
    return { frontier, needsReview, headRevisionId: needsReview ? null : heads.keys().next().value,
      archived: needsReview ? null : archives.keys().next().value,
      headVariants: Array.from(heads, ([headRevisionId, operationIds]) => ({ headRevisionId, operationIds })).sort((a, b) => compare(a.headRevisionId, b.headRevisionId)),
      archiveVariants: Array.from(archives, ([archived, operationIds]) => ({ archived, operationIds })).sort((a, b) => Number(a.archived) - Number(b.archived)) };
  }
  function semanticIssues(record, data) {
    const issues = [];
    record.revisions.forEach((revision, index) => {
      const creator = data.operations.get(revision.operationId);
      if (creator && (!['create', 'revise'].includes(creator.kind) || creator.headRevisionId !== revision.id || creator.recordedAtISO !== revision.recordedAtISO)) add(issues, 'CARE_TEMPLATE_REVISION_CREATOR_INVALID', ['revisions', index]);
    });
    for (const operationId of data.order) {
      const operation = data.operations.get(operationId), index = record.operations.findIndex(item => item.id === operationId), path = ['operations', index];
      if (operation.intent.templateId !== record.templateId) add(issues, 'CARE_TEMPLATE_INTENT_INVALID', path.concat('intent', 'templateId'));
      const writesHead = own(operation, 'headRevisionId'), writesArchive = own(operation, 'archived');
      const expected = { create: [true, true], revise: [true, false], archive: [false, true], resolve: [true, true], noop: [false, false] }[operation.kind];
      if (writesHead !== expected[0] || writesArchive !== expected[1] || operation.outcome.noOp !== (operation.kind === 'noop')) add(issues, 'CARE_TEMPLATE_OPERATION_INVALID', path);
      if ((operation.kind === 'create' || operation.kind === 'revise') && operation.intent.action !== 'save' || operation.kind === 'archive' && operation.intent.action !== 'archive' || operation.kind === 'resolve' && operation.intent.action !== 'resolve' || operation.kind === 'noop' && !['save', 'archive'].includes(operation.intent.action)) add(issues, 'CARE_TEMPLATE_INTENT_INVALID', path);
      if (writesHead && operation.outcome.headRevisionId !== operation.headRevisionId || writesArchive && operation.outcome.archived !== operation.archived) add(issues, 'CARE_TEMPLATE_OUTCOME_INVALID', path);
      if (operation.kind === 'create') {
        if (operation.parents.length || operation.intent.baseToken !== null || operation.archived !== false) add(issues, 'CARE_TEMPLATE_OPERATION_INVALID', path);
      } else if (!operation.parents.length || !digest(operation.intent.baseToken)) add(issues, 'CARE_TEMPLATE_OPERATION_INVALID', path);
      const revision = data.revisions.get(operation.headRevisionId);
      if (['create', 'revise'].includes(operation.kind) && revision) {
        if (revision.operationId !== operation.id || revision.contentDigest !== operation.intent.definitionDigest || operation.kind === 'create' && revision.parentRevisionId !== null) add(issues, 'CARE_TEMPLATE_REVISION_CREATOR_INVALID', path);
      }
      if (!data.complete.get(operationId)) continue;
      const scope = data.ancestors.get(operationId), state = semanticState(data, data.parentFrontiers.get(operationId));
      if (operation.kind === 'create') continue;
      if (!scope.size) { add(issues, 'CARE_TEMPLATE_OPERATION_INVALID', path); continue; }
      if (operation.kind !== 'resolve' && state.needsReview) { add(issues, 'CARE_TEMPLATE_RESOLUTION_REQUIRED', path); continue; }
      if (operation.kind === 'resolve') {
        const chosen = data.revisions.get(operation.headRevisionId);
        if (operation.intent.headRevisionId !== operation.headRevisionId || operation.intent.archived !== operation.archived || chosen && !scope.has(chosen.operationId)) add(issues, 'CARE_TEMPLATE_RESOLUTION_INVALID', path);
      } else {
        if (!writesHead && operation.outcome.headRevisionId !== state.headRevisionId || !writesArchive && operation.outcome.archived !== state.archived) add(issues, 'CARE_TEMPLATE_OUTCOME_INVALID', path);
        if (operation.intent.action === 'archive' && operation.intent.archived !== operation.outcome.archived) add(issues, 'CARE_TEMPLATE_INTENT_INVALID', path);
        if (operation.intent.action === 'save') {
          if (state.archived) add(issues, 'CARE_TEMPLATE_ARCHIVED', path);
          const current = data.revisions.get(state.headRevisionId);
          if (operation.kind === 'noop' && current && operation.intent.definitionDigest !== current.contentDigest) add(issues, 'CARE_TEMPLATE_OUTCOME_INVALID', path);
          if (operation.kind === 'revise' && revision && (revision.parentRevisionId !== state.headRevisionId || current && revision.contentDigest === current.contentDigest)) add(issues, 'CARE_TEMPLATE_REVISION_CREATOR_INVALID', path);
        }
        if (operation.kind === 'archive' && operation.archived === state.archived) add(issues, 'CARE_TEMPLATE_OPERATION_INVALID', path);
      }
    }
    return issues;
  }
  async function verifyTemplateRecord(value) {
    const decoded = decodeTemplateRecord(value);
    if (!decoded.ok) return decoded;
    const record = decoded.record, issues = [], data = graph(record);
    if (data.invalid) return failure('invalid', decoded.raw, [{ code: 'CARE_TEMPLATE_GRAPH_INVALID', path: [], fieldPath: '' }]);
    try {
      // Independent digests run together. Keep issue ordering deterministic;
      // promise completion order must never select a branch or affect a token.
      const revisionChecks = await Promise.all(record.revisions.map(async revision => {
        const checks = await Promise.all([sha('definition-v1', revision.definition), sha('revision-id-v1', { templateId: record.templateId, operationId: revision.operationId })]);
        return checks[0] === revision.contentDigest && 'ctr_' + checks[1] === revision.id;
      }));
      const operationChecks = await Promise.all(record.operations.map(async operation => {
        const node = detached(operation); delete node.nodeDigest;
        const checks = await Promise.all([sha('intent-v1', operation.intent), sha('operation-v1', node)]);
        return checks[0] === operation.fingerprint && checks[1] === operation.nodeDigest;
      }));
      revisionChecks.forEach((valid, index) => { if (!valid) add(issues, 'CARE_TEMPLATE_HASH_MISMATCH', ['revisions', index]); });
      operationChecks.forEach((valid, index) => { if (!valid) add(issues, 'CARE_TEMPLATE_HASH_MISMATCH', ['operations', index]); });
    } catch (error) { add(issues, error.message, []); }
    issues.push(...semanticIssues(record, data));
    if (issues.length) return failure('invalid', decoded.raw, issues);
    if (data.missing.size) return failure('incomplete', decoded.raw, [{ code: 'CARE_TEMPLATE_DEPENDENCY_MISSING', path: [], fieldPath: '', missing: Array.from(data.missing).sort() }], record);
    return { ok: true, kind: 'template', record, raw: decoded.raw, issues: [], readOnly: true };
  }
  function projection(record, data) {
    const state = semanticState(data, data.frontier), parentIds = new Set(record.operations.flatMap(operation => operation.parents));
    const numbers = new Map();
    function revisionNumber(revisionId, visited) {
      if (numbers.has(revisionId)) return numbers.get(revisionId);
      if (visited.has(revisionId)) return null;
      const revision = data.revisions.get(revisionId); if (!revision) return null;
      const next = new Set(visited); next.add(revisionId);
      const parent = revision.parentRevisionId === null ? 0 : revisionNumber(revision.parentRevisionId, next);
      const number = parent === null ? null : parent + 1; numbers.set(revisionId, number); return number;
    }
    return { ok: true, kind: 'template', templateId: record.templateId, ...state,
      revisions: record.revisions.map(revision => ({ ...detached(revision), revisionNumber: revisionNumber(revision.id, new Set()) })),
      operationTips: record.operations.map(operation => operation.id).filter(operationId => !parentIds.has(operationId)).sort(),
      provenanceVerified: false, integrityVerified: true, patientWriterAvailable: false };
  }
  async function getTemplateView(value) {
    const verified = await verifyTemplateRecord(value);
    if (!verified.ok) return verified;
    const view = projection(verified.record, graph(verified.record));
    view.baseToken = await sha('base-token-v1', verified.record);
    return view;
  }
  async function operationOutcome(value, operationId, fingerprint) {
    if (!validateOperationId(operationId)) return { found: false, reason: 'CARE_TEMPLATE_OPERATION_ID_INVALID' };
    const verified = await verifyTemplateRecord(value);
    if (!verified.ok) return { found: false, reason: 'CARE_TEMPLATE_RECORD_UNAVAILABLE', kind: verified.kind, issues: verified.issues };
    const operation = verified.record.operations.find(item => item.id === operationId);
    if (!operation) return { found: false };
    if (operation.fingerprint !== fingerprint) return { found: true, reused: false, reason: 'CARE_TEMPLATE_OPERATION_ID_REUSED' };
    return { found: true, reused: true, outcome: detached(operation.outcome) };
  }
  function requestShape(value) {
    const issues = [];
    if (!object(value)) { add(issues, 'CARE_TEMPLATE_OBJECT_REQUIRED', []); return issues; }
    const allowed = { save: ['templateId', 'operationId', 'baseToken', 'action', 'definition'], archive: ['templateId', 'operationId', 'baseToken', 'action', 'archived'], resolve: ['templateId', 'operationId', 'baseToken', 'action', 'headRevisionId', 'archived'] }[value.action];
    if (!allowed) { add(issues, 'CARE_TEMPLATE_INTENT_INVALID', ['action']); return issues; }
    fields(value, allowed, [], issues); idField(value.templateId, ['templateId'], issues); operationIdField(value.operationId, ['operationId'], issues);
    if (value.baseToken !== null && !digest(value.baseToken)) add(issues, 'CARE_TEMPLATE_DIGEST_INVALID', ['baseToken']);
    if (value.action === 'resolve') idField(value.headRevisionId, ['headRevisionId'], issues);
    if (value.action !== 'save' && typeof value.archived !== 'boolean') add(issues, 'CARE_TEMPLATE_BOOLEAN_REQUIRED', ['archived']);
    return issues;
  }
  async function prepareTemplateOperation(value, request, options) {
    let input;
    try { input = detached(request); } catch (error) { return { ok: false, reason: error.message, issues: [] }; }
    const issues = requestShape(input);
    let definition;
    if (input && input.action === 'save') {
      const normalized = canonicalDefinition(input.definition);
      if (!normalized.ok) issues.push(...normalized.issues);
      else definition = normalized.definition;
    }
    if (issues.length) return { ok: false, reason: 'CARE_TEMPLATE_REQUEST_INVALID', issues };
    const intent = { action: input.action, templateId: input.templateId, baseToken: input.baseToken };
    if (input.action === 'save') intent.definitionDigest = await sha('definition-v1', definition);
    else { intent.archived = input.archived; if (input.action === 'resolve') intent.headRevisionId = input.headRevisionId; }
    const fingerprint = await sha('intent-v1', intent);
    let record = null, view = null;
    if (value !== null) {
      const verified = await verifyTemplateRecord(value);
      if (!verified.ok) return { ...verified, reason: 'CARE_TEMPLATE_RECORD_UNAVAILABLE' };
      record = verified.record;
      if (record.templateId !== input.templateId) return { ok: false, reason: 'CARE_TEMPLATE_ID_MISMATCH', issues: [] };
      // Durable intent recognition precedes current CAS, authoring time and
      // conflict checks. The guarded provider additionally indexes IDs globally.
      const prior = record.operations.find(operation => operation.id === input.operationId);
      if (prior) return prior.fingerprint === fingerprint ? { ok: true, reused: true, record, outcome: detached(prior.outcome), issues: [] } : { ok: false, reason: 'CARE_TEMPLATE_OPERATION_ID_REUSED', issues: [] };
      view = projection(record, graph(record)); view.baseToken = await sha('base-token-v1', record);
      if (input.baseToken !== view.baseToken) return { ok: false, reason: 'CARE_TEMPLATE_STALE_BASE', issues: [] };
      if (view.needsReview && input.action !== 'resolve') return { ok: false, reason: 'CARE_TEMPLATE_RESOLUTION_REQUIRED', issues: [] };
      if (input.action === 'save' && view.archived) return { ok: false, reason: 'CARE_TEMPLATE_ARCHIVED', issues: [] };
    } else if (input.baseToken !== null || input.action !== 'save') return { ok: false, reason: 'CARE_TEMPLATE_CREATE_REQUIRED', issues: [] };
    const time = object(options) && Object.getOwnPropertyDescriptor(options, 'recordedAtISO');
    if (!time || !own(time, 'value') || !instant(time.value)) return { ok: false, reason: 'CARE_TEMPLATE_INSTANT_INVALID', issues: [] };
    const recordedAtISO = time.value;
    let revision, kind, headRevisionId, archived;
    if (!record) {
      record = { domain: DOMAIN, version: VERSION, templateId: input.templateId, revisions: [], operations: [] };
      kind = 'create'; archived = false;
    } else if (input.action === 'save') {
      const current = record.revisions.find(item => item.id === view.headRevisionId);
      kind = current.contentDigest === intent.definitionDigest ? 'noop' : 'revise';
    } else if (input.action === 'archive') kind = view.archived === input.archived ? 'noop' : 'archive';
    else kind = 'resolve';
    if (kind === 'create' || kind === 'revise') {
      headRevisionId = 'ctr_' + await sha('revision-id-v1', { templateId: input.templateId, operationId: input.operationId });
      revision = { id: headRevisionId, parentRevisionId: view ? view.headRevisionId : null, definition, contentDigest: intent.definitionDigest, operationId: input.operationId, recordedAtISO };
    }
    if (kind === 'resolve') {
      if (!record.revisions.some(item => item.id === input.headRevisionId)) return { ok: false, reason: 'CARE_TEMPLATE_RESOLUTION_INVALID', issues: [] };
      headRevisionId = input.headRevisionId; archived = input.archived;
    }
    if (kind === 'archive') archived = input.archived;
    const outcome = { headRevisionId: headRevisionId || view.headRevisionId, archived: typeof archived === 'boolean' ? archived : view.archived, noOp: kind === 'noop' };
    const operation = { id: input.operationId, parents: view ? view.operationTips.slice() : [], fingerprint, kind, recordedAtISO, intent, outcome };
    if (kind === 'create' || kind === 'revise' || kind === 'resolve') operation.headRevisionId = headRevisionId;
    if (kind === 'create' || kind === 'archive' || kind === 'resolve') operation.archived = archived;
    operation.nodeDigest = await sha('operation-v1', operation);
    const event = { domain: DOMAIN, version: VERSION, templateId: input.templateId, operation };
    if (revision) event.revision = revision;
    if (byteLength(canonical(event)) > LIMITS.maxOperationPlainBytes) return { ok: false, reason: 'CARE_TEMPLATE_EVENT_LIMIT', issues: [] };
    const proposed = sortedRecord({ ...record, revisions: revision ? record.revisions.concat(revision) : record.revisions, operations: record.operations.concat(operation) });
    const verified = await verifyTemplateRecord(proposed);
    if (!verified.ok) return { ...verified, reason: verified.kind === 'limited' ? 'CARE_TEMPLATE_CAPACITY' : 'CARE_TEMPLATE_OPERATION_INVALID' };
    const nextView = projection(verified.record, graph(verified.record)); nextView.baseToken = await sha('base-token-v1', verified.record);
    return { ok: true, reused: false, record: verified.record, event, outcome: detached(outcome), view: nextView, issues: [] };
  }

  async function unionRecords(left, right) {
    const first = await verifyTemplateRecord(left), second = await verifyTemplateRecord(right);
    if (!first.ok && first.kind !== 'incomplete') return first;
    if (!second.ok && second.kind !== 'incomplete') return second;
    if (first.record.templateId !== second.record.templateId) return failure('invalid', null, [{ code: 'CARE_TEMPLATE_ID_MISMATCH', path: [], fieldPath: '' }]);
    const combined = { domain: DOMAIN, version: VERSION, templateId: first.record.templateId, revisions: [], operations: [] };
    for (const key of ['revisions', 'operations']) {
      const items = new Map();
      for (const item of first.record[key].concat(second.record[key])) {
        if (items.has(item.id) && !equal(items.get(item.id), item)) return failure('invalid', null, [{ code: 'CARE_TEMPLATE_IMMUTABLE_COLLISION', path: [key], fieldPath: key }]);
        items.set(item.id, item);
      }
      combined[key] = Array.from(items.values());
    }
    const result = await verifyTemplateRecord(sortedRecord(combined));
    if (result.ok) { result.view = projection(result.record, graph(result.record)); result.view.baseToken = await sha('base-token-v1', result.record); }
    return result;
  }
  async function mergeTemplateRecords(left, right) { return unionRecords(left, right); }
  async function applyTemplateEvent(value, eventValue) {
    let event;
    try { event = detached(eventValue); } catch (error) { return failure('invalid', null, [{ code: error.message, path: [], fieldPath: '' }]); }
    const issues = [];
    if (!fields(event, ['domain', 'version', 'templateId', 'operation', 'revision'], [], issues)) return failure('invalid', event, issues);
    if (event.domain !== DOMAIN || event.version !== VERSION) return failure('unsupported', event, [{ code: 'CARE_TEMPLATE_VERSION_UNSUPPORTED', path: [], fieldPath: '' }]);
    if (issues.length) return failure('unsupported', event, issues);
    if (byteLength(canonical(event)) > LIMITS.maxOperationPlainBytes) return failure('limited', event, [{ code: 'CARE_TEMPLATE_EVENT_LIMIT', path: [], fieldPath: '' }]);
    // An event is one append, not a partial aggregate. A missing dependency may
    // be staged, but a revision smuggled under a different operation may not.
    if (object(event.operation)) {
      const createsRevision = ['create', 'revise'].includes(event.operation.kind);
      if (createsRevision !== own(event, 'revision') || createsRevision && (!object(event.revision) || event.revision.operationId !== event.operation.id || event.revision.id !== event.operation.headRevisionId)) return failure('invalid', event, [{ code: 'CARE_TEMPLATE_EVENT_REVISION_MISMATCH', path: ['revision'], fieldPath: 'revision' }]);
    }
    const incoming = { domain: DOMAIN, version: VERSION, templateId: event.templateId, revisions: own(event, 'revision') ? [event.revision] : [], operations: [event.operation] };
    const verified = await verifyTemplateRecord(incoming);
    if (!verified.ok && verified.kind !== 'incomplete') return verified;
    return value === null ? verified : unionRecords(value, incoming);
  }

  root.VildaCareTemplateModel = Object.freeze({ VERSION, OP_ID_PATTERN, validateOperationId, LIMITS, TASK_KINDS, OUTCOMES,
    validateDraft, validateDefinition, canonicalDefinition, sameDefinition,
    createDefinitionDraft, duplicateDefinition, copyPatientStructureDraft, reviewTextKey,
    decodeTemplateRecord, verifyTemplateRecord, getTemplateView, operationOutcome,
    prepareTemplateOperation, applyTemplateEvent, mergeTemplateRecords });
})(typeof window !== 'undefined' ? window : globalThis);
