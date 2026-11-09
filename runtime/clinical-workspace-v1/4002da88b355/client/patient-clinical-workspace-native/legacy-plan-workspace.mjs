// Per-plan transactions backed by the existing encrypted patient-note store.
// Encryption, IndexedDB CAS and durability stay in the native vault closure.
// This adapter never creates an account, changes its route or owns a key.
const ID = /^[A-Za-z0-9_.-]{1,160}$/;
const clone = value => value == null ? value : structuredClone(value);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
function fail(code) { throw Object.assign(new Error('Nie można potwierdzić zapisu planu. Odśwież jego widok i spróbuj ponownie.'), { code: 'CARE_NATIVE_' + code }); }
function identifier(value) { if (typeof value !== 'string' || !ID.test(value)) fail('INVALID'); return value; }

/**
 * loadPlans(): [{state,stored}]. loadPatient(id): visible native patient|null.
 * loadDocument(id): {note,stored,tombstone?,projection?}; note is null when
 * not visible. A hidden synthetic row includes its authenticated projection.
 * withLock(action) holds one account-scoped lease across reads and commit.
 * commit(change) encrypts and atomically writes one parent plus its effects,
 * validates every supplied before/dependency (including absence), and resolves
 * {saved:true} only after transaction.oncomplete / durable backend completion.
 * No input payload or successful callback substitutes for that durable result.
 */
export function createLegacyPlanWorkspace(options) {
  const { loadPlans, loadPatient, loadDocument, commit, assertCurrent, withLock, mutationModel } = options;
  if ([loadPlans, loadPatient, loadDocument, commit, assertCurrent, withLock, mutationModel?.validateState]
    .some(value => typeof value !== 'function')) fail('INVALID');
  function checkedState(value) {
    const checked = mutationModel.validateState(value);
    if (!checked?.ok) fail('STATE_INVALID');
    return clone(checked.state);
  }
  async function run(callback, mutable, operationId) {
    if (typeof callback !== 'function') fail('INVALID');
    assertCurrent();
    return withLock(async () => {
      assertCurrent();
      const rows = await loadPlans(); assertCurrent();
      if (!Array.isArray(rows)) fail('STATE_INVALID');
      const plans = new Map(), documents = new Map(), patients = new Map(), writes = new Map(), operations = new Set();
      for (const row of rows) {
        const state = checkedState(row?.state), id = identifier(state.record.id);
        if (plans.has(id) || !row.stored) fail('STATE_INVALID');
        for (const operation of state.operations) { if (operations.has(operation.id)) fail('STATE_INVALID'); operations.add(operation.id); }
        plans.set(id, { state, stored: clone(row.stored) });
      }
      let active = true, pending = 0, planId = null, nextState = null;
      function check() { if (!active) fail('CLOSED'); assertCurrent(); }
      function writable() { check(); if (!mutable) fail('READ_ONLY'); }
      async function tracked(action) { check(); pending++; try { const result = await action(); check(); return result; } finally { pending--; } }
      async function patient(id) {
        identifier(id); check();
        if (!patients.has(id)) {
          const value = await loadPatient(id); check();
          if (value && value.patientId !== id) fail('PATIENT_INVALID');
          patients.set(id, clone(value || null));
        }
        return clone(patients.get(id));
      }
      async function document(id) {
        identifier(id); check();
        if (!documents.has(id)) {
          const value = await loadDocument(id); check();
          const row = { note: clone(value?.note || null), stored: clone(value?.stored || null), tombstone: clone(value?.tombstone || null), projection: clone(value?.projection || null) };
          if (row.note && (row.note.id !== id || !row.stored) || row.stored && row.stored.id !== id
            || row.tombstone && row.tombstone.id !== id) fail('DOCUMENT_INVALID');
          documents.set(id, row);
        }
        return documents.get(id);
      }
      async function effect(value) {
        writable();
        if (value?.action === 'createDocument') {
          const note = clone(value.document), id = identifier(note?.id), previous = await document(id); check();
          if (value.expectedRevision !== null || previous.stored || previous.tombstone || writes.has(id)
            || !await patient(note.patientId)) fail('CONFLICT');
          writes.set(id, { before: null, note });
          return;
        }
        if (value?.action !== 'projectReminder') fail('INVALID');
        const id = identifier(value.id), prior = await document(id); check();
        if (!await patient(value.patientId)) fail('CONFLICT');
        if (writes.has(id)) fail('CONFLICT');
        const context = value.careContext;
        if (context?.version !== 2 || context.role !== 'step' || !ID.test(context.planId || '') || !ID.test(context.stepId || '')) fail('INVALID');
        const projection = { version: 1, planId: context.planId, stepId: context.stepId };
        if (prior.tombstone) fail('CONFLICT');
        if (prior.stored && (prior.stored.patientId !== value.patientId || (prior.note
          ? prior.note.patientId !== value.patientId || prior.note.careContext?.version !== 2
            || prior.note.careContext.role !== 'step' || prior.note.careContext.planId !== context.planId
            || prior.note.careContext.stepId !== context.stepId
          : !same(prior.projection, projection)))) fail('CONFLICT');
        if (!value.active) {
          if (prior.stored && prior.note) writes.set(id, { before: clone(prior.stored), note: { id, patientId: value.patientId }, remove: true });
          return;
        }
        const note = { id, patientId: value.patientId, title: value.title, body: value.body, category: 'followup',
          clinicalDateISO: null, careContext: clone(context), dueDateISO: value.dueDateISO, dueTime: value.dueTime,
          completedAtISO: null, noShowAtISO: null };
        writes.set(id, { before: clone(prior.stored), note });
      }
      const tx = Object.freeze({
        getPlan(id) { check(); identifier(id); return clone(id === planId ? nextState : plans.get(id)?.state || null); },
        listPlans() {
          check(); const result = new Map([...plans].map(([id, row]) => [id, row.state]));
          if (planId) result.set(planId, nextState);
          return [...result.values()].map(clone);
        },
        getPatient(id) { return tracked(() => patient(id)); },
        getDocument(id) { return tracked(async () => {
          const write = writes.get(id); if (write) return write.remove ? null : clone(write.note);
          return clone((await document(id)).note);
        }); },
        setPlan(id, state) {
          writable(); identifier(id); const checked = checkedState(state);
          if (checked.record.id !== id || planId && planId !== id) fail('MULTIPLE_PLANS');
          if (same(plans.get(id)?.state || null, checked)) return;
          planId = id; nextState = checked;
        },
        applyDocumentEffect(value) { return tracked(() => effect(clone(value))); },
      });
      try {
        const result = await callback(tx); check();
        if (pending) fail('PENDING_OPERATION');
        if (writes.size && !planId) fail('PARENT_REQUIRED');
        const change = planId ? {
          operationId, planId, before: clone(plans.get(planId)?.stored || null), state: clone(nextState),
          writes: [...writes.values()].map(clone),
          readDependencies: [...documents].filter(([id, value]) => id !== planId && !writes.has(id) && value.stored)
            .map(([noteId, value]) => ({ noteId, stored: clone(value.stored), tombstone: clone(value.tombstone) })),
        } : null;
        if (change && change.writes.some(write => write.note.patientId !== change.state.record.patientId || write.note.id === planId)) fail('PATIENT_INVALID');
        active = false;
        if (change) {
          assertCurrent();
          const outcome = await commit(change); assertCurrent();
          if (outcome?.saved !== true) fail('CONFLICT');
        }
        return result;
      } finally { active = false; }
    });
  }
  return Object.freeze({
    async getCapability() { assertCurrent(); return { available: true }; },
    read(callback) { return run(callback, false, null); },
    transact(operationId, callback) { identifier(operationId); return run(callback, true, operationId); },
  });
}
