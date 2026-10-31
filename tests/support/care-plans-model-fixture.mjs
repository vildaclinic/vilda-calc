import { expect } from '@playwright/test';
import { mutatePlan, openCarePlans, selectPlan } from './care-plans-fixture.mjs';
import { createFictionalVault, loadPatient, readyForPatient, shellFrame } from './centile-live-fixture.mjs';

export function dormantModelNote(patientId) {
  const stages = ['a', 'b'].map(key => ({
    id: 'fictional-stage-' + key, kind: 'regular', title: 'Fikcyjny etap ' + key,
    definitionOperationId: 'fictional-stage-definition-' + key,
    stepIds: ['fictional-step-' + key], control: { state: 'planned', activation: null, review: null },
  }));
  return {
    id: 'fictional-model-plan', patientId, title: 'Fikcyjny plan modelu', category: 'care-plan', rev: 3,
    careContext: {
      version: 2, role: 'plan', status: 'active', goal: 'Wyłącznie fikcyjny plan do testów.',
      stageOrder: stages.map(stage => stage.id), stages,
      steps: stages.map((stage, index) => ({
        id: stage.stepIds[0], stageId: stage.id, title: 'Fikcyjny krok ' + (index ? 'b' : 'a'),
        taskKind: 'Badanie', instruction: '', definitionOperationId: 'fictional-step-definition-' + (index ? 'b' : 'a'),
        requiredOutcome: 'resultReceipt', reminderRule: index ? { kind: 'stage-offset', amount: 1, unit: 'month' } : { kind: 'none' },
        reminderSchedule: null, omission: null,
      })),
      facts: [{ id: 'fictional-receipt-fact', stepId: 'fictional-step-b', kind: 'resultReceipt',
        effectiveDateISO: '2026-10-28', recordedAtISO: '2026-10-29T09:00:00.000Z', recordedLocalDateISO: '2026-10-29',
        operationId: 'fictional-receipt-operation', evidence: { noteId: 'fictional-original-result', sourceRecordRevAtCapture: 1 } }],
      factCorrections: [],
      associations: [
        { id: 'fictional-result-association', stepId: 'fictional-step-b', kind: 'result', noteId: 'fictional-original-result',
          sourceRecordRevAtCapture: 1, operationId: 'fictional-link-result', recordedAtISO: '2026-10-29T09:00:00.000Z' },
        { id: 'fictional-event-association', stepId: 'fictional-step-b', kind: 'event', noteId: 'fictional-original-event',
          sourceRecordRevAtCapture: 1, operationId: 'fictional-link-event', recordedAtISO: '2026-10-29T09:01:00.000Z' },
      ], log: [],
    },
  };
}

// Only the fresh fictional account created by the care fixture is inspected.
// Binary ciphertext is kept in the comparison rather than JSON's empty object
// representation of ArrayBuffer, so a read that rewrites encryption is caught.
export async function rawCareStorage(frame) {
  return frame.evaluate(async () => {
    const user = window.VildaVault.getCurrentUser();
    if (!user?.userId) throw Error('Missing fictional model-test account');
    const canonical = value => {
      if (value instanceof ArrayBuffer) return { bytes: Array.from(new Uint8Array(value)) };
      if (ArrayBuffer.isView(value)) return { bytes: Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
      if (Array.isArray(value)) return value.map(canonical);
      if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
      return value;
    };
    const open = name => new Promise((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      // A test observer must never create or upgrade a database.
      request.onupgradeneeded = () => { request.transaction.abort(); reject(Error('Unexpected missing model-test database')); };
    });
    const databases = await indexedDB.databases();
    const clinicalName = window.VildaVault.USER_DB_PREFIX + user.userId;
    const wanted = databases.filter(db => db.name === clinicalName || db.name === 'vilda_sync_' + user.userId);
    if (!wanted.some(db => db.name === clinicalName)) throw Error('Missing fictional clinical database');
    const result = {};
    for (const metadata of wanted.sort((a, b) => a.name.localeCompare(b.name))) {
      const database = await open(metadata.name);
      try {
        const stores = [...database.objectStoreNames].filter(name => metadata.name !== clinicalName || name !== 'meta').sort();
        const transaction = database.transaction(stores, 'readonly');
        const rows = await Promise.all(stores.map(name => new Promise((resolve, reject) => {
          const request = transaction.objectStore(name).getAll();
          request.onsuccess = () => resolve([name, canonical(request.result)]);
          request.onerror = () => reject(request.error);
        })));
        result[metadata.name] = { version: database.version, stores: Object.fromEntries(rows) };
      } finally { database.close(); }
    }
    return result;
  });
}

export async function seedLegacyModelPlan(created) {
  const plan = await mutatePlan(created.frame, created.ids.a, null, 'create', {
    title: 'Fikcyjny plan starszego formatu', goal: 'Fikcyjny zapis o niepełnym pochodzeniu faktów.',
  });
  const first = await mutatePlan(created.frame, created.ids.a, plan.planId, 'addStep', {
    step: { title: 'Fikcyjny równoległy krok', kind: 'Badanie', state: 'pending',
      reminderDateISO: '2026-11-10', reminderTime: '08:15', eventDateISO: '2026-11-18', eventTime: '14:30' },
  });
  const second = await mutatePlan(created.frame, created.ids.a, plan.planId, 'addStep', {
    step: { title: 'Fikcyjny równoległy krok', kind: 'Oczekujący wynik', state: 'waiting',
      reminderDateISO: '2026-11-12', reminderTime: '09:45' },
  });
  // Simulate one encrypted record written before causal lineage existed. The
  // current authoring API deliberately cannot invent this historical unknown.
  // This setup uses no account/data outside this fresh fictional profile.
  await created.frame.evaluate(async ({ planId, stepId }) => {
    const user = window.VildaVault.getCurrentUser();
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open(window.VildaVault.USER_DB_PREFIX + user.userId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const raw = await new Promise((resolve, reject) => {
        const request = database.transaction('patientNotes', 'readonly').objectStore('patientNotes').get(planId);
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      const plain = await window.VildaVault.decryptPayloadForCurrentUser(raw.bodyCipher.iv, raw.bodyCipher.data);
      delete plain.careContext.causality;
      const step = plain.careContext.steps.find(item => item.id === stepId);
      step.state = 'done'; step.completedDateISO = null;
      delete step.completionSource;
      raw.bodyCipher = await window.VildaVault.encryptPayloadForCurrentUser(plain);
      await new Promise((resolve, reject) => {
        const transaction = database.transaction('patientNotes', 'readwrite');
        transaction.objectStore('patientNotes').put(raw);
        transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || Error('Legacy fixture write aborted'));
      });
    } finally { database.close(); }
  }, { planId: plan.planId, stepId: first.stepId });
  return { planId: plan.planId, firstStepId: first.stepId, secondStepId: second.stepId };
}

export async function modelReadState(frame, patientId, planId) {
  return frame.evaluate(async ({ patientId, planId }) => ({
    rawNote: await window.VildaVault.getPatientNote(planId),
    patient: await window.VildaVault.getPatient(patientId),
    dirty: window.VildaSaveStatusIndicator?.getState(),
    patientId: sessionStorage.getItem('vildaCurrentPatientId'),
  }), { patientId, planId });
}

export function expectLegacyModelView(view, note, seeded) {
  expect(view).toMatchObject({ kind: 'v1', readOnly: true, provenanceVerified: false,
    writeCapability: { available: false, code: 'CARE_V2_WRITER_DISABLED' },
    record: { id: seeded.planId, patientId: note.patientId, rev: note.rev } });
  expect(view.rawContext).toEqual(note.careContext);
  expect(view.facts).toEqual([]);
  expect(view.stages).toHaveLength(1);
  const stage = view.stages[0];
  expect(stage).toMatchObject({ viewKey: 'legacy:' + seeded.planId, kind: 'legacy', control: null, legacyState: 'unclassified' });
  expect(stage.legacyContext).toEqual(note.careContext);
  expect(stage.steps.map(step => step.id)).toEqual([seeded.firstStepId, seeded.secondStepId]);
  expect(stage.steps.map(step => step.legacy)).toEqual(note.careContext.steps);
  expect(stage.steps[0]).toMatchObject({ legacyCompletion: { state: 'done', provenance: 'unknown', storedSource: null }, facts: [] });
  expect(stage.steps[0].legacy).toMatchObject({ completedDateISO: null, reminderDateISO: '2026-11-10', reminderTime: '08:15',
    eventDateISO: '2026-11-18', eventTime: '14:30' });
  expect(stage.steps[1].legacy).toMatchObject({ state: 'waiting', reminderDateISO: '2026-11-12', reminderTime: '09:45' });
  expect(stage.steps[1].facts).toEqual([]);
}

export async function legacyModelReadScenario(page, { shell = false } = {}) {
  // A restored patient uses an absolute Date.now()+1600 autosave guard. The
  // shared careFixture freezes Date, which would prevent that guard expiring
  // after F5. Keep the same fictional day while letting the real guard elapse.
  await page.clock.install({ time: new Date('2026-10-29T10:00:00+01:00') });
  await page.clock.resume();
  await page.addInitScript(() => {
    localStorage.setItem('vilda-sync-enabled-v1', 'false');
    sessionStorage.setItem('vilda-probe-done-v1', '1');
    sessionStorage.setItem('vilda-new-device-restore-shown-v1', '1');
  });
  const created = await createFictionalVault(page, { shell });
  await created.frame.waitForFunction(() => Boolean(window.VildaVault?.mutateCarePlan));
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  const seeded = await seedLegacyModelPlan(created);
  let frame = created.frame;
  await loadPatient(frame, created.ids.a, 'restore');
  await frame.waitForFunction(() => window.VildaSaveStatusIndicator?.getState() === 'saved'
    && window.VildaSaveStatusIndicator?.isReadyForSharedReference?.());
  await frame.waitForFunction(() => Boolean(window.VildaCarePlanModel && window.VildaVault.getCarePlanView));
  const beforeStorage = await rawCareStorage(frame);
  const before = await modelReadState(frame, created.ids.a, seeded.planId);
  const view = await frame.evaluate(id => window.VildaVault.getCarePlanView(id, { todayLocalDateISO: '2026-10-29' }), seeded.planId);
  expectLegacyModelView(view, before.rawNote, seeded);
  const frozenRead = await frame.evaluate(async id => {
    const note = await window.VildaVault.getPatientNote(id);
    const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
    freeze(note);
    const bytes = JSON.stringify(note), model = window.VildaCarePlanModel;
    const decoded = model.decodeCarePlanRecord(note);
    const projected = model.projectCarePlan(decoded, { todayLocalDateISO: '2026-10-29' });
    return { unchanged: JSON.stringify(note) === bytes, projected, capability: model.getWriteCapability({ available: true, formatVersion: 2 }) };
  }, seeded.planId);
  expect(frozenRead.unchanged).toBe(true);
  expectLegacyModelView(frozenRead.projected, before.rawNote, seeded);
  expect(frozenRead.capability).toMatchObject({ available: false, code: 'CARE_V2_WRITER_DISABLED' });
  const blocked = await frame.evaluate(async ({ patientId, planId, rev }) => {
    const vault = window.VildaVault;
    const fake = { available: true, formatVersion: 2, namespace: 'vault-format-2', writeEpoch: 'fake' };
    const attempt = async action => { try { await action(); return null; } catch (error) { return error.code; } };
    return {
      generic: await attempt(() => vault.savePatientNote({ patientId, title: 'Fikcyjny zabroniony zapis', body: 'Fikcyjny tekst.',
        category: 'care-plan', careContext: { version: 2, role: 'plan' }, writeCapability: fake })),
      mutation: await attempt(() => vault.mutateCarePlan({ patientId, planId, baseRev: rev, operationId: 'fictional-rejected-v2-edit',
        action: 'edit', title: 'Fikcyjny zabroniony tytuł', careContext: { version: 2, role: 'plan' }, writeCapability: fake })),
      capability: vault.getCarePlanWriteCapability(fake),
    };
  }, { patientId: created.ids.a, planId: seeded.planId, rev: before.rawNote.rev });
  expect(blocked).toMatchObject({ generic: 'CARE_FORMAT_UNSUPPORTED', mutation: 'CARE_FORMAT_UNSUPPORTED',
    capability: { available: false, code: 'CARE_V2_WRITER_DISABLED' } });
  expect(await rawCareStorage(frame)).toEqual(beforeStorage);
  expect(await modelReadState(frame, created.ids.a, seeded.planId)).toEqual(before);

  if (shell) {
    await page.evaluate(() => { location.hash = '#/klirens'; });
    const clearance = await shellFrame(page, 'Kalkulator klirensu');
    await clearance.waitForFunction(() => Boolean(window.VildaVault?.isUnlocked() && window.VildaCarePlanModel));
    const routeView = await clearance.evaluate(id => window.VildaVault.getCarePlanView(id, { todayLocalDateISO: '2026-10-29' }), seeded.planId);
    expectLegacyModelView(routeView, before.rawNote, seeded);
    await page.evaluate(() => { location.hash = '#/start'; });
    frame = await shellFrame(page);
    expect(await rawCareStorage(frame)).toEqual(beforeStorage);
    expect(await modelReadState(frame, created.ids.a, seeded.planId)).toEqual(before);
  }
  await page.reload({ waitUntil: 'load' });
  frame = shell ? await shellFrame(page) : page;
  await readyForPatient(frame);
  await frame.waitForFunction(() => window.VildaSaveStatusIndicator?.getState() === 'saved'
    && window.VildaSaveStatusIndicator?.isReadyForSharedReference?.());
  const reloaded = await frame.evaluate(id => window.VildaVault.getCarePlanView(id, { todayLocalDateISO: '2026-10-29' }), seeded.planId);
  expectLegacyModelView(reloaded, before.rawNote, seeded);
  expect(await rawCareStorage(frame)).toEqual(beforeStorage);
  expect(await modelReadState(frame, created.ids.a, seeded.planId)).toEqual(before);
  const panel = await openCarePlans(page); await selectPlan(panel, seeded.planId);
  await expect(panel.locator('.vcp-detail .vcp-title')).toHaveText(before.rawNote.title);
  expect(await rawCareStorage(frame)).toEqual(beforeStorage);
  expect(await modelReadState(frame, created.ids.a, seeded.planId)).toEqual(before);
}
