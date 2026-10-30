import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const DAY = '2026-10-29';
let serial = 0;
const op = () => 'fictional-lineage-' + ++serial;
const storage = () => {
  const map = new Map();
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key), key: index => [...map.keys()][index] ?? null,
    get length() { return map.size; } };
};
async function device() {
  const win = { crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: storage(), sessionStorage: storage(), setTimeout, clearTimeout,
    addEventListener() {}, removeEventListener() {}, document: { addEventListener() {}, removeEventListener() {}, hidden: false } };
  win.window = win; win.self = win; win.top = win;
  for (const file of ['vilda_crypto.js', 'vilda_vault.js']) loadBrowserScript(file, win);
  const vault = win.VildaVault, adapter = vault.createInMemoryAdapter(); vault.setStorageAdapter(adapter);
  const password = 'Fikcyjny#Lineage!' + ++serial;
  await vault.createUser(password, { iterations: 10000, label: 'Fikcyjny sejf historii planu' });
  const patientId = (await vault.savePatient({ name: 'Fikcyjna Alicja Historia', user: { sex: 'F', age: 12, height: 150, weight: 40 } })).patientId;
  return { win, vault, adapter, password, patientId, userId: vault.getCurrentUser().userId };
}
async function create(d) {
  const result = await d.vault.mutateCarePlan({ patientId: d.patientId, operationId: op(), action: 'create', title: 'Fikcyjny plan historii' });
  expect(result.saved).toBe(true); return result.plan;
}
async function mutate(d, plan, action, extra = {}) {
  return d.vault.mutateCarePlan({ planId: plan.id, patientId: plan.patientId, baseRev: plan.rev, operationId: op(), action, ...extra });
}
async function add(d, plan, title = 'Fikcyjny wspólny krok') {
  const result = await mutate(d, plan, 'addStep', { step: { title, kind: 'Badanie', state: 'pending', reminderDateISO: DAY } });
  expect(result.saved).toBe(true); return result;
}
async function notes(d, plan, count) {
  for (let index = 0; index < count; index++) {
    const result = await mutate(d, plan, 'addNote', { dateISO: DAY, text: 'Fikcyjne ustalenie ' + index });
    expect(result.saved).toBe(true); plan = result.plan;
  }
  return plan;
}
async function fork({ legacy = false, empty = false } = {}) {
  const a = await device(); let plan = await create(a);
  if (!empty) plan = (await add(a, plan)).plan;
  if (legacy) await editRawContext(a, plan.id, context => { delete context.causality; });
  const b = await device(); await b.vault.mergeSyncPayload(await a.vault.exportSyncPayload());
  return { a, b, plan: await a.vault.getCarePlan(plan.id), other: await b.vault.getCarePlan(plan.id) };
}
async function editRawContext(d, id, change) {
  const raw = await d.adapter.getPatientNoteForUser(d.userId, id);
  const plain = await d.vault.decryptPayloadForCurrentUser(raw.bodyCipher.iv, raw.bodyCipher.data);
  await change(plain.careContext);
  const bodyCipher = await d.vault.encryptPayloadForCurrentUser(plain);
  await d.adapter.putPatientNoteForUser(d.userId, { ...raw, bodyCipher });
}
const record = (d, id) => d.vault.getPatientNote(id);
const raw = (d, id) => d.adapter.getPatientNoteForUser(d.userId, id);
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const facts = async (d, id) => { const note = await record(d, id); return canonical({ title: note.title, context: note.careContext }); };
const due = async d => (await d.vault.listPatientNotesDueByDate('2999-12-31T23:59:59.999Z')).flatMap(group => group.notes);

describe('Care plan causal history is separate from the bounded response cache', () => {
  // Only the long-history cases get 30s: they perform 100–200 real encrypted
  // writes (or two such branches); ordinary guards retain the default budget.
  for (const count of [99, 100, 101, 200]) {
    it('receives an ordinary closed descendant after ' + count + ' writes without reopening it', async () => {
      const { a, b, plan, other } = await fork();
      const changed = await notes(b, other, count);
      const closed = await mutate(b, changed, 'close', { reason: 'Fikcyjny koniec', text: 'Fikcyjne zamknięcie po długiej historii.', cancelOpen: true });
      await a.vault.mergeSyncPayload(await b.vault.exportSyncPayload());
      const received = await a.vault.getCarePlan(plan.id);
      expect(received).toMatchObject({ status: 'closed', syncNeedsReview: false, syncLineageUnknown: false });
      expect(received.steps).toEqual(closed.plan.steps); expect(received.log).toEqual(closed.plan.log);
      const context = (await record(a, plan.id)).careContext;
      expect(context.operations).toHaveLength(100);
      expect(context.causality.seenOperationIds.length).toBe(count + 3);
      const before = await raw(a, plan.id);
      await a.vault.mergeSyncPayload(await b.vault.exportSyncPayload());
      expect(await raw(a, plan.id)).toEqual(before);
    }, 30_000);
  }

  it('bootstraps an exact legacy base only on a write and recognizes its distant descendant', async () => {
    const { a, b, plan, other } = await fork({ legacy: true });
    const before = await raw(a, plan.id);
    expect((await record(a, plan.id)).careContext.causality).toBeUndefined();
    await a.vault.listCarePlans(); await a.vault.getCarePlan(plan.id);
    expect(await raw(a, plan.id)).toEqual(before);
    const changed = await notes(b, other, 101);
    await mutate(b, changed, 'close', { reason: 'Fikcyjny koniec', text: 'Fikcyjne zamknięcie starego planu.', cancelOpen: true });
    await a.vault.mergeSyncPayload(await b.vault.exportSyncPayload());
    expect(await a.vault.getCarePlan(plan.id)).toMatchObject({ status: 'closed', syncNeedsReview: false });
    expect((await record(a, plan.id)).careContext.causality.roots).toHaveLength(1);
  }, 30_000);

  it('retains closed status and visible unresolved work when a legacy client loses lineage', async () => {
    const { a, b, plan, other } = await fork({ empty: true });
    await mutate(a, plan, 'close', { reason: 'Fikcyjny koniec', text: 'Fikcyjny plan zakończony na A.' });
    const pending = await add(b, other, 'Fikcyjny krok zachowany z B');
    await editRawContext(b, plan.id, context => { delete context.causality; });
    await a.vault.mergeSyncPayload(await b.vault.exportSyncPayload());
    let merged = await a.vault.getCarePlan(plan.id);
    expect(merged).toMatchObject({ status: 'closed', syncNeedsReview: true, syncLineageUnknown: true });
    expect(merged.steps.find(step => step.id === pending.stepId).state).toBe('pending');
    expect((await due(a)).filter(note => note.careContext?.planId === plan.id)).toEqual([
      expect.objectContaining({ title: 'Przejrzyj plan po synchronizacji: ' + plan.title, careContext: { version: 1, role: 'decision', planId: plan.id } }),
    ]);
    await expect(mutate(a, merged, 'acknowledgeMerge')).rejects.toThrow(/Wznów plan|uzasadnienie/);
    expect(await a.vault.getCarePlan(plan.id)).toEqual(merged);
    await expect(mutate(a, merged, 'acknowledgeMerge', { cancelOpen: true, text: '' })).rejects.toThrow(/uzasadnienie/);
    const accepted = await mutate(a, merged, 'acknowledgeMerge', { cancelOpen: true, text: 'Fikcyjne uzasadnienie odstąpienia od zachowanych kroków.' });
    expect(accepted.saved).toBe(true); merged = await a.vault.getCarePlan(plan.id);
    expect(merged).toMatchObject({ status: 'closed', syncNeedsReview: false, syncLineageUnknown: false, needsDecision: false });
    expect(merged.steps.find(step => step.id === pending.stepId).state).toBe('cancelled');
    expect((await due(a)).filter(note => note.careContext?.planId === plan.id)).toEqual([]);
  });

  it('an explicit reopen preserves the separate unresolved review until it is acknowledged', async () => {
    const { a, b, plan, other } = await fork({ empty: true });
    await mutate(a, plan, 'close', { reason: 'Fikcyjny koniec', text: 'Fikcyjne zakończenie A.' });
    const added = await add(b, other); await editRawContext(b, plan.id, context => { delete context.causality; });
    await a.vault.mergeSyncPayload(await b.vault.exportSyncPayload());
    const reopened = await mutate(a, await a.vault.getCarePlan(plan.id), 'reopen', { text: 'Fikcyjna świadoma decyzja o wznowieniu.' });
    expect(reopened.plan).toMatchObject({ status: 'active', syncNeedsReview: true, syncLineageUnknown: true });
    expect((await due(a)).some(note => note.title.startsWith('Przejrzyj plan po synchronizacji:'))).toBe(true);
    const reviewed = await mutate(a, reopened.plan, 'acknowledgeMerge', { text: 'Fikcyjny przegląd po wznowieniu.' });
    expect(reviewed.plan).toMatchObject({ status: 'active', syncNeedsReview: false, syncLineageUnknown: false });
    expect(reviewed.plan.steps.find(step => step.id === added.stepId).state).toBe('pending');
  });

  it('preserves real concurrent changes and one-sided step and metadata edits beyond the cache horizon', async () => {
    const { a, b, plan, other } = await fork();
    const edited = await mutate(a, plan, 'editStep', { stepId: plan.steps[0].id, step: { ...plan.steps[0], title: 'Fikcyjna poprawka kroku tylko A' } });
    const named = await mutate(a, edited.plan, 'edit', { title: 'Fikcyjna nazwa tylko A', goal: 'Fikcyjny cel tylko A' });
    const left = await notes(a, named.plan, 101), right = await notes(b, other, 110);
    const payloadA = await a.vault.exportSyncPayload(), payloadB = await b.vault.exportSyncPayload();
    await a.vault.mergeSyncPayload(payloadB); await b.vault.mergeSyncPayload(payloadA);
    for (const d of [a, b]) {
      const merged = await d.vault.getCarePlan(plan.id);
      expect(merged).toMatchObject({ title: 'Fikcyjna nazwa tylko A', goal: 'Fikcyjny cel tylko A', syncNeedsReview: true, syncLineageUnknown: false });
      expect(merged.steps[0].title).toBe('Fikcyjna poprawka kroku tylko A');
      expect(merged.log.length).toBeGreaterThanOrEqual(Math.max(left.log.length, right.log.length));
    }
  }, 30_000);

  it('merges three offline branches in either order and ignores all later ancestor replays', async () => {
    const { a, b, plan, other } = await fork(), c = await device(), reverse = await device();
    const baseline = await a.vault.exportSyncPayload();
    await c.vault.mergeSyncPayload(baseline); await reverse.vault.mergeSyncPayload(baseline);
    const addedA = await add(a, plan, 'Fikcyjny krok A');
    const addedB = await add(b, other, 'Fikcyjny krok B');
    const addedC = await add(c, await c.vault.getCarePlan(plan.id), 'Fikcyjny krok C');
    const [pa, pb, pc] = await Promise.all([a.vault.exportSyncPayload(), b.vault.exportSyncPayload(), c.vault.exportSyncPayload()]);
    await a.vault.mergeSyncPayload(pb); await a.vault.mergeSyncPayload(pc);
    await reverse.vault.mergeSyncPayload(pc); await reverse.vault.mergeSyncPayload(pb); await reverse.vault.mergeSyncPayload(pa);
    const canonical = await a.vault.getCarePlan(plan.id), swapped = await reverse.vault.getCarePlan(plan.id);
    const ids = [plan.steps[0].id, addedA.stepId, addedB.stepId, addedC.stepId].sort();
    expect(canonical.steps.map(step => step.id).sort()).toEqual(ids); expect(swapped.steps.map(step => step.id).sort()).toEqual(ids);
    expect(await facts(a, plan.id)).toEqual(await facts(reverse, plan.id));
    await reverse.vault.mergeSyncPayload(await a.vault.exportSyncPayload());
    const stable = await raw(reverse, plan.id);
    for (const payload of [pc, baseline, pb, pa, pc]) await reverse.vault.mergeSyncPayload(payload);
    expect(await raw(reverse, plan.id)).toEqual(stable);
    const reviewed = await mutate(a, canonical, 'acknowledgeMerge');
    await reverse.vault.mergeSyncPayload(await a.vault.exportSyncPayload());
    expect(await reverse.vault.getCarePlan(plan.id)).toMatchObject({ syncNeedsReview: false, title: reviewed.plan.title });
  });

  it('rejects an old operation ID outside the response cache without replaying it or acknowledging unknown content', async () => {
    const d = await device(), plan = await create(d), operationId = op();
    const request = { planId: plan.id, patientId: plan.patientId, baseRev: plan.rev, operationId, action: 'addStep',
      step: { title: 'Fikcyjny jednokrotny krok', reminderDateISO: DAY } };
    const first = await d.vault.mutateCarePlan(request);
    const latest = await notes(d, first.plan, 101), before = await raw(d, plan.id);
    for (const payload of [request, { ...request, baseRev: latest.rev, step: { title: 'Fikcyjna inna treść' } }]) {
      expect(await d.vault.mutateCarePlan(payload)).toMatchObject({ saved: false, reason: 'operation-outcome-expired', needsRefresh: true });
      expect(await raw(d, plan.id)).toEqual(before);
    }
    expect((await d.vault.getCarePlan(plan.id)).steps).toHaveLength(1);
  }, 30_000);

  it('transports a distant closed descendant in real encrypted deltas with a shared sync identity', async () => {
    const { a, b, plan } = await fork();
    const code = await a.vault.exportSyncCode(a.password); b.vault.lock('manual');
    await b.vault.importSyncCode(code, a.password, { label: 'Fikcyjna wspólna tożsamość' });
    b.userId = b.vault.getCurrentUser().userId; await b.vault.mergeSyncPayload(await a.vault.exportSyncPayload());
    const changed = await notes(b, await b.vault.getCarePlan(plan.id), 101);
    await mutate(b, changed, 'close', { reason: 'Fikcyjny koniec', text: 'Fikcyjne zamknięcie przez deltę.', cancelOpen: true });
    const delta = await b.vault.buildNoteDelta(plan.id); await a.vault.applyEncryptedDelta(delta);
    expect(await a.vault.getCarePlan(plan.id)).toMatchObject({ status: 'closed', syncNeedsReview: false });
    const before = await raw(a, plan.id); await a.vault.applyEncryptedDelta(delta); expect(await raw(a, plan.id)).toEqual(before);
  }, 30_000);

  it('preserves lineage through patient export/import and whole-account backup', async () => {
    const d = await device(), plan = (await add(d, await create(d))).plan;
    const original = (await record(d, plan.id)).careContext.causality;
    const target = await device(), envelope = await d.vault.exportPatientEnvelope(plan.patientId);
    await target.vault.importPatientFromEnvelope(envelope, d.password);
    expect((await record(target, plan.id)).careContext.causality).toEqual(original);
    const backup = await d.vault.exportVaultBackup(), restored = await device();
    await restored.vault.restoreVaultBackup(backup, d.password, { label: 'Fikcyjne odtworzenie konta' });
    expect((await record(restored, plan.id)).careContext.causality).toEqual(original);
  });

  for (const component of ['metadata', 'step']) it('converges X→Y and concurrent W for ' + component + ' without losing the hidden maximal value', async () => {
    const { a, b, plan, other } = await fork(), left = await device(), right = await device();
    const base = await a.vault.exportSyncPayload();
    await left.vault.mergeSyncPayload(base); await right.vault.mergeSyncPayload(base);
    const write = (d, p, prefix, label) => mutate(d, p, component === 'metadata' ? 'edit' : 'editStep', {
      operationId: prefix + '-causal-' + serial,
      ...(component === 'metadata' ? { title: 'Fikcyjny ' + label, goal: 'Fikcyjny cel ' + label } : { stepId: p.steps[0].id, step: { ...p.steps[0], title: 'Fikcyjny krok ' + label, description: 'Fikcyjny opis ' + label } }),
    });
    const x = await write(a, plan, 'z', 'X'), px = await a.vault.exportSyncPayload();
    await write(a, x.plan, 'a', 'Y'); const py = await a.vault.exportSyncPayload();
    await write(b, other, 'm', 'W'); const pw = await b.vault.exportSyncPayload();
    for (const payload of [px, pw, py]) await left.vault.mergeSyncPayload(payload);
    for (const payload of [px, py, pw]) await right.vault.mergeSyncPayload(payload);
    expect(await facts(left, plan.id)).toEqual(await facts(right, plan.id));
    const merged = await left.vault.getCarePlan(plan.id), key = component === 'metadata' ? 'metadata' : 'step';
    expect(merged.syncLineageUnknown).toBe(false);
    const review = merged.syncReview.components.find(item => item.key === key);
    expect(review.variants).toHaveLength(2);
    expect(review.variants.map(item => component === 'metadata' ? item.value.goal : item.value.description).sort()).toEqual(component === 'metadata' ? ['Fikcyjny cel W', 'Fikcyjny cel Y'] : ['Fikcyjny opis W', 'Fikcyjny opis Y']);
    const noted = await mutate(left, merged, 'addNote', { text: 'Fikcyjna notatka nierozstrzygająca wariantów.', dateISO: DAY });
    expect(noted.plan.syncReview.components.find(item => item.key === key).variants).toEqual(review.variants);
    await right.vault.mergeSyncPayload(await left.vault.exportSyncPayload());
    expect(await facts(left, plan.id)).toEqual(await facts(right, plan.id));
    const accepted = await mutate(left, noted.plan, 'acknowledgeMerge');
    const archived = accepted.plan.log.find(entry => entry.resolution)?.resolution;
    expect(archived.components.find(item => item.key === key).variants).toEqual(review.variants);
    expect(accepted.plan.syncReview).toBeUndefined();
    for (const payload of [pw, px, py]) await left.vault.mergeSyncPayload(payload);
    const afterNote = await mutate(left, await left.vault.getCarePlan(plan.id), 'addNote', { text: 'Fikcyjna notatka po przeglądzie.', dateISO: DAY });
    expect(afterNote.plan).toMatchObject({ syncNeedsReview: false, syncLineageUnknown: false });
    expect(afterNote.plan.log.find(entry => entry.resolution)?.resolution).toEqual(archived);
  });

  it('keeps proven new-work projection active even after its last open step is completed, until explicit review', async () => {
    const { a, b, plan, other } = await fork({ empty: true });
    await mutate(a, plan, 'close', { reason: 'Fikcyjny koniec', text: 'Fikcyjne zamknięcie.' });
    const work = await add(b, other);
    await a.vault.mergeSyncPayload(await b.vault.exportSyncPayload());
    let merged = await a.vault.getCarePlan(plan.id);
    expect(merged).toMatchObject({ status: 'active', syncNeedsReview: true, syncLineageUnknown: false });
    const completed = await mutate(a, merged, 'complete', { stepId: work.stepId, dateISO: DAY, text: 'Fikcyjne wykonanie.', continuation: 'decide' });
    await b.vault.mergeSyncPayload(await a.vault.exportSyncPayload());
    expect(await b.vault.getCarePlan(plan.id)).toMatchObject({ status: 'active', syncNeedsReview: true });
    const noted = await mutate(b, await b.vault.getCarePlan(plan.id), 'addNote', { dateISO: DAY, text: 'Fikcyjne dalsze ustalenie.' });
    await a.vault.mergeSyncPayload(await b.vault.exportSyncPayload());
    merged = await a.vault.getCarePlan(plan.id);
    expect(merged).toMatchObject({ status: 'active', syncNeedsReview: true });
    expect(merged.steps[0].state).toBe('done');
    const accepted = await mutate(a, merged, 'acknowledgeMerge');
    expect(accepted.plan).toMatchObject({ status: 'active', syncNeedsReview: false });
    expect(completed.saved && noted.saved).toBe(true);
  });

  it('does not reopen a proven close merged with a note-only branch', async () => {
    const { a, b, plan, other } = await fork({ empty: true });
    await mutate(a, plan, 'close', { reason: 'Fikcyjny koniec', text: 'Fikcyjne zamknięcie.' });
    await mutate(b, other, 'addNote', { dateISO: DAY, text: 'Fikcyjna notatka równoległa.' });
    await a.vault.mergeSyncPayload(await b.vault.exportSyncPayload());
    expect(await a.vault.getCarePlan(plan.id)).toMatchObject({ status: 'closed', syncNeedsReview: true, syncLineageUnknown: false });
  });

  it('keeps unknown closed review resolved across old-peer replay and later notes', async () => {
    const { a, b, plan, other } = await fork({ empty: true });
    await mutate(a, plan, 'close', { reason: 'Fikcyjny koniec', text: 'Fikcyjne zamknięcie.' });
    await add(b, other); await editRawContext(b, plan.id, context => { delete context.causality; });
    const legacy = await b.vault.exportSyncPayload(); await a.vault.mergeSyncPayload(legacy);
    const reviewed = await mutate(a, await a.vault.getCarePlan(plan.id), 'acknowledgeMerge', { cancelOpen: true, text: 'Fikcyjna decyzja zakończenia bez wykonania.' });
    expect(reviewed.plan.log.some(entry => entry.resolution)).toBe(true);
    await a.vault.mergeSyncPayload(legacy);
    const noted = await mutate(a, await a.vault.getCarePlan(plan.id), 'addNote', { dateISO: DAY, text: 'Fikcyjna notatka po przeglądzie.' });
    await a.vault.mergeSyncPayload(legacy);
    expect(await a.vault.getCarePlan(plan.id)).toMatchObject({ status: 'closed', syncNeedsReview: false, syncLineageUnknown: false });
    expect(noted.saved).toBe(true);
  });

  for (const transport of ['full', 'delta']) it('propagates union limit through real ' + transport + ' merge and retains the parent for retry', async () => {
    const { a, b, plan } = await fork({ empty: true });
    if (transport === 'delta') {
      const code = await a.vault.exportSyncCode(a.password); b.vault.lock('manual');
      await b.vault.importSyncCode(code, a.password, { label: 'Fikcyjny limit delty' }); b.userId = b.vault.getCurrentUser().userId;
      await b.vault.mergeSyncPayload(await a.vault.exportSyncPayload());
    }
    for (const [d, prefix] of [[a, 'left'], [b, 'right']]) await editRawContext(d, plan.id, context => {
      const root = context.causality.nodes.find(node => !node.parents.length).id;
      for (let index = 0; index < 8500; index++) context.causality.nodes.push({ id: 'fictional-' + prefix + '-' + index, parents: [root] });
    });
    const before = await raw(a, plan.id), payload = transport === 'full' ? await b.vault.exportSyncPayload() : await b.vault.buildNoteDelta(plan.id);
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(transport === 'full' ? a.vault.mergeSyncPayload(payload) : a.vault.applyEncryptedDelta(payload)).rejects.toMatchObject({ code: 'CARE_LINEAGE_LIMIT', vildaMergeBusy: true });
      expect(await raw(a, plan.id)).toEqual(before);
    }
    expect((await record(b, plan.id)).careContext.causality.nodes).toHaveLength(8502);
  });

  for (const corruption of ['cycle', 'missing-parent', 'parents', 'openWork']) it('rejects a ' + corruption + ' DAG without silently accepting or losing the incoming parent', async () => {
    const { a, b, plan } = await fork();
    const before = await raw(a, plan.id);
    await editRawContext(b, plan.id, context => {
      const node = context.causality.nodes.find(item => item.parents.length);
      if (corruption === 'cycle') node.parents = [node.id];
      if (corruption === 'missing-parent') node.parents = ['fictional-missing-parent'];
      if (corruption === 'parents') node.parents = [context.causality.nodes.find(item => item.id !== node.id && item.parents.length).id];
      if (corruption === 'openWork') node.openWork = !node.openWork;
    });
    const payload = await b.vault.exportSyncPayload();
    await expect(a.vault.mergeSyncPayload(payload)).rejects.toMatchObject({ code: 'CARE_LINEAGE_INVALID', vildaMergeBusy: true });
    expect(await raw(a, plan.id)).toEqual(before);
  });

  it('retains a changed value outside an existing register as an unknown variant', async () => {
    const { a, b, plan, other } = await fork();
    await mutate(a, plan, 'edit', { title: 'Fikcyjna wersja A', goal: 'Fikcyjny cel A' });
    await mutate(b, other, 'edit', { title: 'Fikcyjna wersja B', goal: 'Fikcyjny cel B' });
    await a.vault.mergeSyncPayload(await b.vault.exportSyncPayload());
    await b.vault.mergeSyncPayload(await a.vault.exportSyncPayload());
    const rawB = await raw(b, plan.id), plain = await b.vault.decryptPayloadForCurrentUser(rawB.bodyCipher.iv, rawB.bodyCipher.data);
    plain.title = 'Fikcyjna nieprzewidziana wersja C'; plain.careContext.goal = 'Fikcyjny nowy cel C';
    plain.careContext.steps[0].title = 'Fikcyjny zmieniony krok C';
    await b.adapter.putPatientNoteForUser(b.userId, { ...rawB, bodyCipher: await b.vault.encryptPayloadForCurrentUser(plain) });
    const pa = await a.vault.exportSyncPayload(), pb = await b.vault.exportSyncPayload();
    await a.vault.mergeSyncPayload(pb); await b.vault.mergeSyncPayload(pa);
    expect(await facts(a, plan.id)).toEqual(await facts(b, plan.id));
    const reviewed = await a.vault.getCarePlan(plan.id);
    expect(reviewed).toMatchObject({ syncNeedsReview: true, syncLineageUnknown: true });
    expect(reviewed.syncReview.components.find(item => item.key === 'metadata').variants.some(item => item.value.title === plain.title)).toBe(true);
  });

  it('archives superseded component variants when edited before the final review', async () => {
    const { a, b, plan, other } = await fork();
    await mutate(a, plan, 'editStep', { stepId: plan.steps[0].id, step: { ...plan.steps[0], title: 'Fikcyjny A', description: 'Fikcyjny pełny opis A' } });
    await mutate(b, other, 'editStep', { stepId: plan.steps[0].id, step: { ...plan.steps[0], title: 'Fikcyjny B', description: 'Fikcyjny pełny opis B' } });
    await a.vault.mergeSyncPayload(await b.vault.exportSyncPayload());
    const merged = await a.vault.getCarePlan(plan.id), variants = merged.syncReview.components.find(item => item.key === 'step').variants;
    const edited = await mutate(a, merged, 'editStep', { stepId: plan.steps[0].id, step: { ...merged.steps[0], title: 'Fikcyjna rozstrzygnięta wersja' } });
    expect(edited.plan.log.find(entry => entry.resolution)?.resolution.components.find(item => item.key === 'step').variants).toEqual(variants);
    const accepted = await mutate(a, edited.plan, 'acknowledgeMerge');
    await b.vault.mergeSyncPayload(await a.vault.exportSyncPayload());
    expect((await b.vault.getCarePlan(plan.id)).log.filter(entry => entry.resolution)).toEqual(accepted.plan.log.filter(entry => entry.resolution));
  });

  for (const afterReview of [false, true]) it('retains an unknown old-writer step before ancestor pruning' + (afterReview ? ' after review of another component' : ''), async () => {
    const { a, b, plan, other } = await fork();
    if (afterReview) {
      await mutate(a, plan, 'edit', { title: 'Fikcyjna nazwa A', goal: 'Fikcyjny cel A' });
      await mutate(b, other, 'edit', { title: 'Fikcyjna nazwa B', goal: 'Fikcyjny cel B' });
      await a.vault.mergeSyncPayload(await b.vault.exportSyncPayload());
      await mutate(a, await a.vault.getCarePlan(plan.id), 'acknowledgeMerge');
    } else {
      const first = await mutate(a, plan, 'editStep', { stepId: plan.steps[0].id, step: { ...plan.steps[0], title: 'Fikcyjny nowszy krok X' } });
      await mutate(a, first.plan, 'editStep', { stepId: plan.steps[0].id, step: { ...first.plan.steps[0], title: 'Fikcyjny nowszy krok Y' } });
    }
    await editRawContext(b, plan.id, context => { context.steps[0].title = 'Fikcyjny niezgodny stary krok C'; });
    const unknown = await b.vault.exportSyncPayload();
    await a.vault.mergeSyncPayload(unknown);
    const received = await a.vault.getCarePlan(plan.id);
    expect(received).toMatchObject({ syncNeedsReview: true, syncLineageUnknown: true });
    expect(received.syncReview.components.find(item => item.key === 'step').variants.some(item => item.value.title === 'Fikcyjny niezgodny stary krok C')).toBe(true);
    await mutate(a, received, 'acknowledgeMerge');
    await a.vault.mergeSyncPayload(unknown);
    expect(await a.vault.getCarePlan(plan.id)).toMatchObject({ syncNeedsReview: false, syncLineageUnknown: false });
  });

  it('rejects a changed old authored log instead of silently pruning or accepting it', async () => {
    const { a, b, plan, other } = await fork();
    await mutate(a, plan, 'addNote', { text: 'Fikcyjne nowsze ustalenie A.', dateISO: DAY });
    await editRawContext(b, other.id, context => { context.log[0].text += ' Fikcyjna zmieniona dawna treść.'; });
    const beforeA = await raw(a, plan.id), beforeB = await raw(b, plan.id), incoming = await b.vault.exportSyncPayload();
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(a.vault.mergeSyncPayload(incoming)).rejects.toMatchObject({ code: 'CARE_LINEAGE_INVALID', vildaMergeBusy: true });
      expect(await raw(a, plan.id)).toEqual(beforeA);
      expect(await raw(b, plan.id)).toEqual(beforeB);
    }
  });

  it('does not globally silence a third unknown value or fingerprint after resolving A/B', async () => {
    const { a, b, plan, other } = await fork(), operationId = 'fictional-same-operation-' + serial;
    await mutate(a, plan, 'edit', { operationId, title: 'Fikcyjny A', goal: 'Fikcyjny cel A', text: 'Fikcyjny wariant żądania A' });
    await mutate(b, other, 'edit', { operationId, title: 'Fikcyjny A', goal: 'Fikcyjny cel A', text: 'Fikcyjny wariant żądania B' });
    const pa = await a.vault.exportSyncPayload(), pb = await b.vault.exportSyncPayload();
    await a.vault.mergeSyncPayload(pb);
    expect(await a.vault.getCarePlan(plan.id)).toMatchObject({ syncLineageUnknown: true });
    await mutate(a, await a.vault.getCarePlan(plan.id), 'acknowledgeMerge');
    for (const payload of [pa, pb]) await a.vault.mergeSyncPayload(payload);
    expect(await a.vault.getCarePlan(plan.id)).toMatchObject({ syncNeedsReview: false, syncLineageUnknown: false });
    const pc = structuredClone(pb), parent = pc.patientNotes.find(note => note.id === plan.id);
    parent.title = 'Fikcyjny nieznany C'; parent.careContext.goal = 'Fikcyjny cel C';
    parent.careContext.operations.find(item => item.id === operationId).fingerprint = 'c'.repeat(64);
    await a.vault.mergeSyncPayload(pc);
    const unknown = await a.vault.getCarePlan(plan.id);
    expect(unknown).toMatchObject({ syncNeedsReview: true, syncLineageUnknown: true });
    expect(unknown.syncReview.components.find(item => item.key === 'metadata').variants.some(item => item.value.goal === 'Fikcyjny cel C')).toBe(true);
    const delayed = await notes(a, unknown, 101);
    const delayedContext = (await record(a, plan.id)).careContext;
    expect(delayedContext.operations.some(item => item.id === operationId)).toBe(false);
    expect(delayedContext.causality.fingerprints.find(item => item.id === operationId).values).toContain('c'.repeat(64));
    const accepted = await mutate(a, delayed, 'acknowledgeMerge');
    const archive = accepted.plan.log.filter(entry => entry.resolution).at(-1).resolution;
    expect(archive.operations).toContainEqual({ id: operationId, fingerprint: 'c'.repeat(64) });
    for (const payload of [pc, pa, pb, pc]) await a.vault.mergeSyncPayload(payload);
    expect(await a.vault.getCarePlan(plan.id)).toMatchObject({ syncNeedsReview: false, syncLineageUnknown: false });
    const fourth = structuredClone(pc), fourthParent = fourth.patientNotes.find(note => note.id === plan.id);
    fourthParent.title = 'Fikcyjny nieznany D'; fourthParent.careContext.goal = 'Fikcyjny cel D';
    fourthParent.careContext.operations.find(item => item.id === operationId).fingerprint = 'e'.repeat(64);
    await a.vault.mergeSyncPayload(fourth);
    const unseen = await a.vault.getCarePlan(plan.id);
    expect(unseen).toMatchObject({ syncNeedsReview: true, syncLineageUnknown: true });
    expect(unseen.syncReview.components.find(item => item.key === 'metadata').variants.some(item => item.value.goal === 'Fikcyjny cel D')).toBe(true);
  }, 30_000);

  for (const component of ['step', 'log']) it('rejects changed immutable ' + component + ' commitments under a shared older writer', async () => {
    const { a, b, plan } = await fork();
    const newer = await mutate(a, plan, 'editStep', { stepId: plan.steps[0].id, step: { ...plan.steps[0], title: 'Fikcyjny nowszy krok' } });
    expect(newer.saved).toBe(true);
    const digest = async value => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical(value))))).toString('hex');
    await editRawContext(b, plan.id, async context => {
      const value = component === 'step' ? context.steps[0] : context.log[0], original = await digest(value);
      if (component === 'step') value.title = 'Fikcyjny zmieniony starszy krok'; else value.text += ' Fikcyjna zmiana starej historii.';
      const binding = context.causality.commitments.find(item => item.key === (component === 'step' ? 'step:' + value.id : 'log') && item.digest === original);
      expect(binding).toBeDefined(); binding.digest = await digest(value);
    });
    const beforeA = await raw(a, plan.id), beforeB = await raw(b, plan.id), payload = await b.vault.exportSyncPayload();
    await expect(a.vault.mergeSyncPayload(payload)).rejects.toMatchObject({ code: 'CARE_LINEAGE_INVALID', vildaMergeBusy: true });
    expect(await raw(a, plan.id)).toEqual(beforeA); expect(await raw(b, plan.id)).toEqual(beforeB);
  });

  it('keeps the existing projected review date across a next-day note and ancestor replay', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date(2026, 9, 28, 12));
      const { a, b, plan, other } = await fork();
      await mutate(a, plan, 'edit', { title: 'Fikcyjna nazwa A', goal: 'Fikcyjny cel A' });
      await mutate(b, other, 'edit', { title: 'Fikcyjna nazwa B', goal: 'Fikcyjny cel B' });
      const ancestor = await b.vault.exportSyncPayload(); await a.vault.mergeSyncPayload(ancestor);
      const merged = await a.vault.getCarePlan(plan.id);
      expect(merged).toMatchObject({ syncNeedsReview: true, syncLineageUnknown: false, decisionDueDateISO: '2026-10-28' });
      vi.setSystemTime(new Date(2026, 9, 29, 12));
      const noted = await mutate(a, merged, 'addNote', { text: 'Fikcyjna notatka następnego dnia.', dateISO: '2026-10-29' });
      expect(noted.plan.decisionDueDateISO).toBe('2026-10-28');
      await a.vault.mergeSyncPayload(ancestor); await b.vault.mergeSyncPayload(await a.vault.exportSyncPayload());
      expect(await a.vault.getCarePlan(plan.id)).toMatchObject({ syncNeedsReview: true, syncLineageUnknown: false, decisionDueDateISO: '2026-10-28' });
      expect(await facts(a, plan.id)).toEqual(await facts(b, plan.id));
    } finally { vi.useRealTimers(); }
  });

  it('never silently trims causal history at its limit', async () => {
    const d = await device(), plan = await create(d);
    await editRawContext(d, plan.id, context => {
      const root = context.causality.nodes.find(node => !node.parents.length).id;
      for (let index = 0; context.causality.nodes.length < 16384; index++) context.causality.nodes.push({ id: 'fictional-bound-' + index, parents: [root] });
    });
    const current = await d.vault.getCarePlan(plan.id), before = await raw(d, plan.id);
    await expect(mutate(d, current, 'addNote', { dateISO: DAY, text: 'Fikcyjne ustalenie ponad limit.' })).rejects.toThrow(/limit/);
    expect(await raw(d, plan.id)).toEqual(before);
    expect((await record(d, plan.id)).careContext.causality.nodes).toHaveLength(16384);
  });

  for (const guard of ['adapter', 'session', 'account']) it('checks the captured ' + guard + ' after hashing a legacy base', async () => {
    const d = await device(), plan = await create(d); await editRawContext(d, plan.id, context => { delete context.causality; });
    const current = await d.vault.getCarePlan(plan.id), before = await raw(d, plan.id), crypto = d.win.crypto;
    let digests = 0;
    d.win.crypto = { randomUUID: crypto.randomUUID.bind(crypto), getRandomValues: crypto.getRandomValues.bind(crypto),
      subtle: new Proxy(crypto.subtle, { get(target, key) { if (key === 'digest') return async (...args) => {
        const digest = await target.digest(...args); if (++digests === 2) { if (guard === 'adapter') d.vault.setStorageAdapter(d.vault.createInMemoryAdapter()); else { d.vault.lock('manual'); if (guard === 'session') await d.vault.unlockUser(d.userId, d.password); else await d.vault.createUser('Fikcyjne#InneKonto!', { iterations: 10000, label: 'Inne fikcyjne konto' }); } } return digest;
      }; const value = target[key]; return typeof value === 'function' ? value.bind(target) : value; } }) };
    await expect(mutate(d, current, 'addNote', { dateISO: DAY, text: 'Fikcyjne ustalenie po zmianie magazynu.' })).rejects.toThrow(/Sesja/);
    expect(await raw(d, plan.id)).toEqual(before);
    d.vault.setStorageAdapter(d.adapter);
  });
});
