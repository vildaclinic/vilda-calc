// Portable staged plans live inside the existing encrypted parent note. This
// codec grants no write authority; native account/session/CAS checks still own
// admission. An old protected-workspace reference without this marker is not
// a portable record and must continue through its existing guarded reader.
export const PORTABLE_PLAN_FORMAT = 'vilda-native-care-plan-v1';
const ID = /^[A-Za-z0-9_.-]{1,160}$/;
const ENVELOPE = ['nativeFormat', 'nativeState', 'nativeConflicts'];
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
function fail(code) { throw Object.assign(new Error('Nie można potwierdzić kompletności planu opieki.'), { code: 'CARE_NATIVE_' + code }); }
function copy(value) {
  const ancestors = new Set(); let nodes = 0, units = 0;
  function visit(item, depth) {
    if (++nodes > 2000000 || depth > 56) fail('PLAN_LIMIT');
    if (item === null || typeof item === 'boolean') return item;
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (typeof item === 'string') { if ((units += item.length) > 64 * 1024 * 1024) fail('PLAN_LIMIT'); return item; }
    if (!item || typeof item !== 'object' || ancestors.has(item)) fail('PLAN_INVALID');
    const prototype = Object.getPrototypeOf(item);
    if (!Array.isArray(item) && prototype !== null && Object.getPrototypeOf(prototype) !== null) fail('PLAN_INVALID');
    const keys = Reflect.ownKeys(item), result = Array.isArray(item) ? [] : {};
    if (keys.some(key => typeof key !== 'string') || Array.isArray(item) && Object.keys(item).length !== item.length) fail('PLAN_INVALID');
    ancestors.add(item);
    for (const key of keys) {
      if (Array.isArray(item) && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor?.enumerable || !own(descriptor, 'value')) fail('PLAN_INVALID');
      Object.defineProperty(result, key, { value: visit(descriptor.value, depth + 1), enumerable: true, writable: true, configurable: true });
    }
    ancestors.delete(item); return result;
  }
  return visit(value, 0);
}
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
function validState(value, model) {
  if (!model || typeof model.validateState !== 'function') fail('PLAN_MODEL_UNAVAILABLE');
  const checked = model.validateState(value);
  if (!checked.ok) fail('PLAN_INVALID');
  return copy(checked.state);
}
function matchingPlan(left, right) { return left.record.id === right.record.id && left.record.patientId === right.record.patientId; }
function uniqueStates(states) {
  const found = new Map();
  for (const state of states) found.set(canonical(state), state);
  return [...found].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, state]) => state);
}
export function isPortablePlanContext(context) { return !!context && context.version === 2 && context.nativeFormat === PORTABLE_PLAN_FORMAT; }
export function encodePortablePlan(input, { mutationModel, conflicts = [] } = {}) {
  const state = validState(input, mutationModel);
  if (!Array.isArray(conflicts) || conflicts.length > 64) fail('PLAN_LIMIT');
  const branches = uniqueStates(conflicts.map(value => validState(value, mutationModel)))
    .filter(value => canonical(value) !== canonical(state));
  if (branches.some(value => !matchingPlan(state, value))) fail('PLAN_BINDING');
  const record = copy(state.record);
  record.careContext = { ...record.careContext, syncNeedsReview: branches.length > 0 || record.careContext.syncNeedsReview,
    nativeFormat: PORTABLE_PLAN_FORMAT, nativeState: state, nativeConflicts: branches };
  return record;
}
export function decodePortablePlan(input, { mutationModel, stored } = {}) {
  const note = copy(input), context = note?.careContext;
  if (!isPortablePlanContext(context) || context.role !== 'plan' || !own(context, 'nativeState')
      || !Array.isArray(context.nativeConflicts) || context.nativeConflicts.length > 64) fail('PLAN_FORMAT_UNSUPPORTED');
  const state = validState(context.nativeState, mutationModel);
  const conflicts = uniqueStates(context.nativeConflicts.map(value => validState(value, mutationModel)));
  if (conflicts.some(value => !matchingPlan(state, value) || canonical(state) === canonical(value))) fail('PLAN_BINDING');
  const expected = encodePortablePlan(state, { mutationModel, conflicts });
  if (canonical(context) !== canonical(expected.careContext)) fail('PLAN_BINDING');
  for (const key of ['id', 'patientId', 'title', 'category']) {
    const values = [];
    if (own(note, key)) values.push(note[key]);
    if (stored && own(stored, key)) values.push(stored[key]);
    if (!values.length || values.some(value => value !== state.record[key])) fail('PLAN_BINDING');
  }
  // The native note transport revision may advance when synchronization retains
  // branches. Domain revision is the immutable command-ledger length instead.
  const revisions = [own(note, 'rev') ? note.rev : undefined, stored && own(stored, 'rev') ? stored.rev : undefined].filter(value => value !== undefined);
  if (!revisions.length || revisions.some(value => !Number.isSafeInteger(value) || value < state.record.rev)) fail('PLAN_BINDING');
  const record = copy(state.record); if (conflicts.length) record.careContext.syncNeedsReview = true;
  return { state, conflicts, hasConflicts: conflicts.length > 0, record };
}
export function encodePortableReference(input) {
  const context = copy(input), roles = ['step', 'calendar', 'result', 'decision', 'note'];
  if (!context || context.version !== 2 || !roles.includes(context.role) || !ID.test(context.planId || '')
      || context.stageId !== null && !ID.test(context.stageId || '') || context.stepId !== null && !ID.test(context.stepId || '')
      || Object.keys(context).some(key => !['version', 'role', 'planId', 'stageId', 'stepId', 'state', 'nativeFormat', 'nativeHidden'].includes(key))
      || own(context, 'nativeFormat') && context.nativeFormat !== PORTABLE_PLAN_FORMAT
      || own(context, 'nativeHidden') && typeof context.nativeHidden !== 'boolean'
      || own(context, 'state') && (context.role !== 'step' || typeof context.state !== 'string' || context.state.length > 80)) fail('PLAN_REFERENCE_INVALID');
  return { ...context, nativeFormat: PORTABLE_PLAN_FORMAT };
}
export function decodePortableReference(input) {
  if (!isPortablePlanContext(input)) fail('PLAN_FORMAT_UNSUPPORTED');
  return encodePortableReference(input);
}
function strictAncestor(left, right) {
  return left.operations.length < right.operations.length && canonical(left.source) === canonical(right.source)
    && left.operations.every((operation, index) => canonical(operation) === canonical(right.operations[index]));
}
export function mergePortablePlans(leftNote, rightNote, { mutationModel, incomingWins = false } = {}) {
  const left = decodePortablePlan(leftNote, { mutationModel }), right = decodePortablePlan(rightNote, { mutationModel });
  if (!matchingPlan(left.state, right.state)) fail('PLAN_BINDING');
  const candidates = uniqueStates([left.state, ...left.conflicts, right.state, ...right.conflicts]);
  // Only exact causal extension can supersede a state. Concurrent command
  // histories cannot be replayed in an invented clinical order; retain them.
  const heads = candidates.filter(candidate => !candidates.some(other => strictAncestor(candidate, other)));
  const preferred = incomingWins ? right.state : left.state;
  const state = heads.find(value => canonical(value) === canonical(preferred)) || heads[0];
  const conflicts = heads.filter(value => canonical(value) !== canonical(state));
  const record = encodePortablePlan(state, { mutationModel, conflicts });
  const changed = canonical(leftNote.careContext) !== canonical(record.careContext) || leftNote.title !== record.title;
  return { context: record.careContext, title: record.title, changed, concurrent: conflicts.length > 0,
    ignoreIncoming: !changed, state: copy(state), conflicts: copy(conflicts), record };
}
