// Native record projection used only inside an admitted workspace operation.
// Nothing in this module grants authority, opens a legacy DB or owns a key.
export const STORE_KEYS = Object.freeze({ noteTombstones: 'id', notes: 'id',
  patientListTombstones: 'id', patientLists: 'id', patientNoteTombstones: 'id',
  patientNotes: 'id', patients: 'patientId', snapshots: 'snapshotId', tombstones: 'patientId' });
const CLINICAL_PREFERENCES = ['wllists', 'wlsched'];
const copy = value => value === undefined ? undefined : structuredClone(value);
export function nativeError(code) {
  return Object.assign(new Error('Nie można potwierdzić operacji danych pacjentów.'), { code: 'CLINICAL_NATIVE_' + code });
}
function fail(code) { throw nativeError(code); }
function own(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
export function selectClinicalMetadata(value) {
  const result = {};
  if (own(value, 'snapshotTombstones')) result.snapshotTombstones = copy(value.snapshotTombstones);
  if (value.userPreferences && typeof value.userPreferences === 'object') {
    result.userPreferences = {};
    for (const key of CLINICAL_PREFERENCES) if (own(value.userPreferences, key)) result.userPreferences[key] = copy(value.userPreferences[key]);
  }
  return result;
}
function mergeMetadata(base, clinical) {
  const next = copy(base || {});
  delete next.snapshotTombstones;
  if (own(clinical, 'snapshotTombstones')) next.snapshotTombstones = copy(clinical.snapshotTombstones);
  next.userPreferences = Object.assign({}, next.userPreferences);
  for (const key of CLINICAL_PREFERENCES) {
    delete next.userPreferences[key];
    if (clinical.userPreferences && own(clinical.userPreferences, key)) next.userPreferences[key] = copy(clinical.userPreferences[key]);
  }
  return next;
}

/** stage is deliberately private and valid only until its enclosing queue
 * operation completes. Every adapter call checks its account AND stage fence. */
export function createNativeStage(input) {
  const { accountId, image, assertCurrent, legacyAdapter, validateCareCommit, validateReminderCommit,
    decrypt, encrypt, clock, isPatientVisible, isDocumentVisible } = input;
  if (typeof accountId !== 'string' || typeof assertCurrent !== 'function' || !image
    || !legacyAdapter || typeof decrypt !== 'function' || typeof encrypt !== 'function' || typeof clock !== 'function') fail('INVALID');
  const native = copy(image), stores = new Map(), shadow = new Map();
  const names = Object.keys(STORE_KEYS).sort();
  if (!Array.isArray(native.stores) || !same(native.stores.map(store => store.name).sort(), names)
    || !native.clinicalMeta || native.clinicalMeta.key !== 'singleton' || !Array.isArray(native.shadows)) fail('CORRUPT');
  for (const store of native.stores) {
    const map = new Map();
    for (const row of store.records) {
      if (!row || typeof row.key !== 'string' || map.has(row.key) || row.value?.[STORE_KEYS[store.name]] !== row.key) fail('CORRUPT');
      map.set(row.key, row.value);
    }
    stores.set(store.name, map);
  }
  for (const row of native.shadows) {
    if (!row || typeof row.key !== 'string' || shadow.has(row.key)) fail('CORRUPT');
    shadow.set(row.key, row.value);
  }
  let active = true, changed = false, metadataAfterCommit = null, denied = null;
  const events = [], plans = copy(native.carePlansV2 || {});
  function check(account = accountId) {
    if (!active) fail('CLOSED');
    if (denied) throw denied;
    assertCurrent();
    if (account !== accountId) fail('ACCOUNT_CHANGED');
  }
  function get(name, key) { check(); return copy(stores.get(name).get(key)); }
  function put(name, value) {
    check(); const key = value && value[STORE_KEYS[name]];
    if (typeof key !== 'string' || !key || key.length > 512) fail('INVALID');
    if (!same(stores.get(name).get(key), value)) { stores.get(name).set(key, copy(value)); changed = true; }
    return copy(value);
  }
  function remove(name, key) { check(); changed = stores.get(name).delete(key) || changed; return true; }
  function list(name, patientId) {
    check(); return Array.from(stores.get(name).values()).filter(row => patientId === undefined || row.patientId === patientId).map(copy);
  }
  function patientVisible(id) {
    const record = get('patients', id), tomb = get('tombstones', id);
    if (!record) return false;
    return typeof isPatientVisible === 'function' ? isPatientVisible(record, tomb) : !tomb;
  }
  function assertNativeDocumentWritable(id) {
    check();
    for (const state of Object.values(plans)) {
      const context = state?.record?.careContext;
      if (!context) continue;
      if (Object.values(state.documentIds?.reminders || {}).includes(id)
        || context.facts?.some(fact => fact.evidence?.noteId === id)
        || context.associations?.some(association => association.noteId === id)
        || context.log?.some(entry => entry.documentIds?.includes(id))) {
        const error = nativeError('DOCUMENT_REFERENCED');
        error.message = 'Ten wpis stanowi dokumentację planu z etapami. Otwórz plan, aby sprawdzić powiązanie.';
        denied = error; throw error;
      }
    }
  }
  function assertNativePatientRemovable(id) {
    check();
    if (Object.values(plans).some(state => state?.record?.patientId === id)) {
      denied = nativeError('PATIENT_REFERENCED');
      denied.message = 'Ten pacjent ma plan z etapami. Nie można usunąć jego karty bez zachowania całej dokumentacji planu.';
      throw denied;
    }
  }
  const adapter = {};
  const methods = [
    ['Patient', 'Patients', 'patients'], ['Snapshot', 'Snapshots', 'snapshots'], ['Tombstone', 'Tombstones', 'tombstones'],
    ['Note', 'Notes', 'notes'], ['NoteTombstone', 'NoteTombstones', 'noteTombstones'],
    ['PatientNote', 'PatientNotes', 'patientNotes'], ['PatientNoteTombstone', 'PatientNoteTombstones', 'patientNoteTombstones'],
    ['PatientList', 'PatientLists', 'patientLists'], ['PatientListTombstone', 'PatientListTombstones', 'patientListTombstones']
  ];
  for (const [singular, plural, store] of methods) {
    adapter['get' + singular + 'ForUser'] = async (account, key) => { check(account); return get(store, key); };
    adapter['list' + plural + 'ForUser'] = async (account, patientId) => { check(account); return list(store, store === 'snapshots' ? patientId : undefined); };
    adapter['put' + singular + 'ForUser'] = async (account, value) => {
      check(account); if (store === 'patientNotes' || store === 'patientNoteTombstones') assertNativeDocumentWritable(value?.id);
      if (store === 'tombstones') assertNativePatientRemovable(value?.patientId);
      return put(store, value);
    };
    adapter['remove' + singular + 'ForUser'] = async (account, key) => {
      check(account); if (store === 'patientNotes' || store === 'patientNoteTombstones') assertNativeDocumentWritable(key);
      return remove(store, key);
    };
  }
  adapter.removePatientForUser = async (account, key) => {
    check(account); assertNativePatientRemovable(key); remove('patients', key);
    for (const record of list('snapshots', key)) remove('snapshots', record.snapshotId);
    return true;
  };
  adapter.getUserMeta = async account => {
    check(account); const base = metadataAfterCommit || await legacyAdapter.getUserMeta(account); check(account);
    return mergeMetadata(base, native.clinicalMeta.value);
  };
  adapter.putUserMeta = async (account, value) => {
    check(account);
    const clinical = selectClinicalMetadata(value);
    if (!same(clinical, native.clinicalMeta.value)) { native.clinicalMeta.value = clinical; changed = true; }
    // Authentication/preferences remain in their native domain. Carry forward
    // the untouched old clinical fields there; never write a stale projection.
    const original = await legacyAdapter.getUserMeta(account); check(account);
    metadataAfterCommit = mergeMetadata(value, selectClinicalMetadata(original || {}));
    return mergeMetadata(metadataAfterCommit, clinical);
  };
  adapter.getSnapshotShadowForUser = async (account, key) => {
    check(account); const row = shadow.get('cien:' + key); return row ? copy(row) : undefined;
  };
  adapter.listSnapshotShadowKeysForUser = async account => { check(account); return [...shadow.keys()].map(key => key.slice(5)); };
  adapter.writeSnapshotShadowsForUser = async (account, values, removed) => {
    check(account);
    for (const value of values || []) {
      if (!value || typeof value.key !== 'string') fail('INVALID');
      const record = { ...copy(value), id: 'cien:' + value.key }, key = record.id;
      if (!same(shadow.get(key), record)) { shadow.set(key, record); changed = true; }
    }
    for (const key of removed || []) changed = shadow.delete('cien:' + key) || changed;
    return true;
  };
  for (const method of ['listRegistry', 'getRegistryEntry', 'putRegistryEntry', 'updateRegistryEntry', 'removeRegistryEntry']) {
    adapter[method] = async (...args) => {
      check(); if (method !== 'listRegistry') {
        const account = method === 'putRegistryEntry' ? args[0]?.userId : args[0];
        if (account !== accountId) fail('ACCOUNT_CHANGED');
      }
      const result = await legacyAdapter[method](...args); check(); return result;
    };
  }
  adapter.deleteUserDatabase = async () => { check(); fail('LIFECYCLE_REQUIRED'); };
  adapter.commitCarePlanForUser = async (account, change) => {
    check(account); if (typeof validateCareCommit !== 'function') fail('UNSUPPORTED');
    const outcome = validateCareCommit(change, { get, list }); check(account);
    if (outcome) return outcome;
    assertNativeDocumentWritable(change.parent.id);
    for (const write of change.writes) assertNativeDocumentWritable(write.note.id);
    put('patientNotes', change.parent);
    for (const write of change.writes) {
      if (write.remove) {
        remove('patientNotes', write.note.id);
        put('patientNoteTombstones', { id: write.note.id, rev: write.expectedRev, deletedAtISO: write.deletedAtISO });
      } else put('patientNotes', write.note);
    }
    return { saved: true };
  };
  adapter.commitReminderForUser = async (account, change) => {
    check(account); if (typeof validateReminderCommit !== 'function') fail('UNSUPPORTED');
    const outcome = validateReminderCommit(change, { get, list }); check(account);
    if (outcome) return outcome;
    assertNativeDocumentWritable(change.parent.id);
    for (const child of change.children) assertNativeDocumentWritable(child.id);
    put('patientNotes', change.parent); for (const child of change.children) put('patientNotes', child);
    return { saved: true };
  };
  async function document(id) {
    check(); const raw = get('patientNotes', id);
    if (!raw || !patientVisible(raw.patientId)) return null;
    const tomb = get('patientNoteTombstones', id);
    if (typeof isDocumentVisible === 'function' ? !isDocumentVisible(raw, tomb, patientId => get('patients', patientId)) : !!tomb) return null;
    const plain = await decrypt(raw.bodyCipher.iv, raw.bodyCipher.data); check();
    return Object.assign({}, plain, { id: raw.id, patientId: raw.patientId, category: raw.category, rev: raw.rev });
  }
  async function writeDocument(value, expectedRevision, extra = {}) {
    check();
    const existing = get('patientNotes', value.id);
    if (!patientVisible(value.patientId)
      || get('patientNoteTombstones', value.id) || (expectedRevision === null ? !!existing : existing?.rev !== expectedRevision)
      || existing && existing.patientId !== value.patientId) fail('CONFLICT');
    const bodyCipher = await encrypt(value); check();
    const now = clock().recordedAtISO;
    put('patientNotes', { ...existing, id: value.id, patientId: value.patientId, category: value.category,
      bodyCipher, rev: (existing?.rev || 0) + 1, createdAtISO: existing?.createdAtISO || now, updatedAtISO: now, ...extra });
  }
  const transaction = Object.freeze({
    getPlan(id) { check(); return own(plans, id) ? copy(plans[id]) : null; },
    setPlan(id, state) {
      check(); if (state?.record?.id !== id) fail('INVALID');
      if (!same(plans[id], state)) { Object.defineProperty(plans, id, { value: copy(state), enumerable: true, writable: true, configurable: true }); changed = true; }
    },
    listPlans() { check(); return Object.values(plans).map(copy); },
    getPatient(id) { check(); return patientVisible(id) ? get('patients', id) : null; },
    getDocument: document,
    operationStatus(id) {
      check();
      const found = Object.values(plans).filter(plan => plan.operations?.some(operation => operation.id === id));
      if (found.length > 1) fail('CORRUPT');
      if (!found.length) return { state: 'not-saved' };
      const state = found[0]; return { state: 'saved', planId: state.record.id, patientId: state.record.patientId, plan: copy(state.record) };
    },
    async applyDocumentEffect(effect) {
      check();
      if (effect?.action === 'createDocument') return writeDocument(effect.document, effect.expectedRevision);
      if (effect?.action !== 'projectReminder') fail('INVALID');
      const existing = get('patientNotes', effect.id), previous = existing ? await document(effect.id) : null; check();
      if (previous && (previous.careContext?.version !== 2 || previous.careContext?.role !== 'step'
        || previous.careContext.planId !== effect.careContext?.planId || previous.careContext.stepId !== effect.careContext?.stepId)) fail('CONFLICT');
      const projection = { version: 1, planId: effect.careContext.planId, stepId: effect.careContext.stepId };
      if (!effect.active) {
        if (!existing) return;
        remove('patientNotes', effect.id);
        put('patientNoteTombstones', { id: effect.id, rev: existing.rev, deletedAtISO: clock().recordedAtISO,
          careStageProjection: projection });
        return;
      }
      const tombstone = get('patientNoteTombstones', effect.id);
      if (tombstone) {
        if (!same(tombstone.careStageProjection, projection)) fail('CONFLICT');
        remove('patientNoteTombstones', effect.id);
      }
      const value = { id: effect.id, patientId: effect.patientId, title: effect.title, body: effect.body,
        category: 'followup', careContext: copy(effect.careContext), clinicalDateISO: null, dueTime: effect.dueTime };
      // Only active work is a native reminder. Removing a derived projection
      // does not claim that a visit or clinical act was completed.
      return writeDocument(value, existing?.rev || null, { dueDateISO: effect.dueDateISO,
        completedAtISO: null, noShowAtISO: null, careStageProjection: projection,
        ...(tombstone ? { rev: (tombstone.rev || 0) + 1 } : {}) });
    }
  });
  return Object.freeze({ adapter: Object.freeze(adapter), transaction,
    get changed() { check(); return changed; },
    image() {
      const compareKeys = ([left], [right]) => left < right ? -1 : left > right ? 1 : 0;
      check(); return { ...copy(native), stores: names.map(name => ({ name, records: [...stores.get(name)].sort(compareKeys).map(([key, value]) => ({ key, value: copy(value) })) })),
        shadows: [...shadow].sort(compareKeys).map(([key, value]) => ({ key, value: copy(value) })), carePlansV2: copy(plans) };
    },
    defer(event) { check(); if (typeof event !== 'function') fail('INVALID'); events.push(event); },
    finish() {
      check(); active = false;
      return { events: events.slice(), metadataAfterCommit: copy(metadataAfterCommit) };
    },
    abort() { active = false; events.length = 0; metadataAfterCommit = null; }
  });
}
