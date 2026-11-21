/* Optional encrypted patient treatment context. These helpers are composed
 * into the deployed vault from readable sources; no store or metadata schema
 * is added. Unknown imported versions remain opaque and read-only. */
function TreatmentContextState(plain) {
  return plain && Object.prototype.hasOwnProperty.call(plain, 'treatmentContext')
    ? { present: true, value: JSON.parse(JSON.stringify(plain.treatmentContext)) }
    : { present: false };
}
function TreatmentContextField(state) {
  return state && state.present ? { treatmentContext: JSON.parse(JSON.stringify(state.value)) } : {};
}
function TreatmentContextWrite(payload, previous, options) {
  const model = v.VildaPatientTreatmentModel;
  if (!model) throw new Error('Brak modułu zapisu leczenia. Otwórz kartę ponownie.');
  let old = { kind: 'none' };
  if (previous.present) try { old = model.normalize(previous.value); } catch (_) { old = { kind: 'unsupported' }; }
  if (old.kind === 'unsupported') {
    // Moving a whole patient is not editing this unknown document. Existing
    // native migration keeps the note ID and its opaque content intact.
    if (options && options.Bnp_przen === true && !Object.prototype.hasOwnProperty.call(payload, 'treatmentContext')) return previous;
    const error = new Error('Ten zapis leczenia ma nieobsługiwany format i pozostaje tylko do odczytu.');
    error.code = 'TREATMENT_UNSUPPORTED'; throw error;
  }
  if (!Object.prototype.hasOwnProperty.call(payload, 'treatmentContext')) return previous;
  const incoming = TreatmentContextState(payload);
  if (previous.present && Bnp_kanon(previous.value) === Bnp_kanon(incoming.value)) return previous;
  const normalized = model.normalize(incoming.value);
  if (old.kind !== 'none' && old.kind !== normalized.kind) {
    const error = new Error('Nie można zmienić rozpoznania w epizod leczenia ani odwrotnie.');
    error.code = 'TREATMENT_INVALID'; throw error;
  }
  return { present: true, value: normalized };
}
function TreatmentOperationCurrent(options) {
  return options && typeof options.isCurrent === 'function' ? options.isCurrent : null;
}
function TreatmentOperationAssert(current) {
  if (current && current() !== true) {
    const error = new Error('Kontekst pacjenta się zmienił. Otwórz kartę ponownie.');
    error.code = 'TREATMENT_STALE'; throw error;
  }
}
function TreatmentContextMerge(previous, incoming, incomingWins) {
  // Legacy editors may omit an optional field they do not understand. Keep
  // that opaque context with the existing document; do not combine diagnoses
  // or individual therapy fields from concurrent versions.
  if (!incomingWins) return previous;
  return Object.prototype.hasOwnProperty.call(incoming, 'treatmentContext') ? TreatmentContextState(incoming) : previous;
}

// A visit adds provenance to a native plan. Present the original v3
// transaction to its existing validator and restore the visit on the recorded
// result. The immutable command ledger binds both the plan and each log entry.
function EncounterDecoratePlanModel(model, resolveOrigin) {
  const bad = () => { throw new Error('Nieprawidłowe powiązanie planu z wizytą.'); };
  function field(record, key) {
    if (!record || typeof record !== 'object') return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (!descriptor) return undefined;
    if (!Object.hasOwn(descriptor, 'value')) bad();
    return descriptor.value;
  }
  function applying(record, changes) {
    const descriptors = Object.getOwnPropertyDescriptors(record);
    for (const [key,value,omit] of changes) {
      if (omit) delete descriptors[key];
      else descriptors[key] = {value, enumerable:true};
    }
    const copy = Array.isArray(record) ? [] : Object.create(Object.getPrototypeOf(record));
    return Object.freeze(Object.defineProperties(copy, descriptors));
  }
  function changed(record,key,value,omit) { return applying(record,[[key,value,omit]]); }
  function visit(record) {
    if (!record || !Object.hasOwn(record, 'visitContext')) return null;
    const value = field(record, 'visitContext');
    const clean = { clinicalDateISO: field(value, 'clinicalDateISO'), version: field(value, 'version'), visitId: field(value, 'visitId') };
    if (!value || Reflect.ownKeys(value).length !== 3) bad();
    EncounterNoteFields({ visitContext: clean });
    return Object.freeze(clean);
  }
  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  const suffix = origin => ',"visitContext":' + JSON.stringify(origin) + '}';
  function translateState(state, origins, decode) {
    if (!state) return state;
    let record = field(state, 'record'), context = field(record, 'careContext');
    let log = field(context, 'log'), operations = field(state, 'operations');
    if (!Array.isArray(log) || !Array.isArray(operations) || operations.length !== log.length || log.length > model.LIMITS.maxOperations) bad();
    const newRows = [], newOperations = [];
    let planOrigin = null;
    for (let index = 0; index < log.length; index++) {
      const row = field(log, index), operation = field(operations, index), key = field(operation, 'id');
      const origin = decode ? visit(row) : origins.get(key);
      if (index === 0) planOrigin = origin;
      if (!origin) continue;
      const ledger = field(operation, 'intentCanonical'), tail = suffix(origin);
      if (typeof ledger !== 'string' || !ledger.endsWith(decode ? tail : '}')) bad();
      const restored = decode ? ledger.slice(0, -tail.length) + '}' : ledger.slice(0, -1) + tail;
      newRows.push([index,changed(row, 'visitContext', origin, decode)]);
      newOperations.push([index,changed(operation, 'intentCanonical', restored)]);
      if (decode) origins.set(key, origin);
    }
    if (decode && !same(visit(record), planOrigin || null)) bad();
    if (!newRows.length) return state;
    if (planOrigin) record = changed(record, 'visitContext', planOrigin, decode);
    context = changed(context, 'log', applying(log,newRows));
    record = changed(record, 'careContext', context);
    return changed(changed(state, 'record', record), 'operations', applying(operations,newOperations));
  }
  function validateState(state) {
    const origins = new Map();
    try {
      const res = model.validateState(translateState(state,origins,true));
      return res.ok && origins.size ? changed(res,'state',translateState(res.state,origins,false)) : res;
    } catch (_) { return model.validateState(state); }
  }
  function prepareTransaction(state, command, clock) {
    const origins = new Map();
    try {
      const plain = translateState(state,origins,true), key = field(command,'operationId');
      const requested = resolveOrigin(key,field(command,'patientId'),field(command,'planId'));
      const origin = requested ? visit({visitContext:requested}) : visit(command);
      const operations = field(plain,'operations');
      const previous = Array.isArray(operations) && operations.some(operation => field(operation,'id') === key);
      if (previous && !same(origin || null,origins.get(key) || null)) return Object.freeze({ok:false,code:'CARE_PLAN_OPERATION_MISMATCH'});
      const clean = origin && Object.hasOwn(command,'visitContext') ? changed(command,'visitContext',null,true) : command;
      const res = model.prepareTransaction(plain,clean,clock);
      if (!res.ok) return res;
      if (origin) origins.set(key,origin);
      return origins.size ? changed(res,'state',translateState(res.state,origins,false)) : res;
    } catch (_) {
      // Always fail closed when an envelope or its active visit is invalid.
      const rejected = model.prepareTransaction(state,command,clock);
      return rejected.ok ? Object.freeze({ok:false,code:'CARE_PLAN_HISTORY_INVALID'}) : rejected;
    }
  }
  return Object.freeze(Object.assign({}, model, {validateState,prepareTransaction}));
}
