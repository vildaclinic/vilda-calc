import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadBrowserScript } from './load-browser-script.mjs';

// Immutable deployed vault237, before durable lineage and the new PR4 commands.
// The existing CI setup fetches this object. Runtime tests never use the network.
export const PRIOR_CARE_COMMIT = 'b461364002cbd3f652728b7db38dce0f1f0d9264';
export const FICTIONAL_DAY = '2026-10-29';
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const historicalSources = new Map();
let serial = 0;
export const operationId = () => 'fictional-pr4-history-' + ++serial;

function historicalSource(file) {
  if (!historicalSources.has(file)) {
    try {
      historicalSources.set(file, execFileSync('git', ['show', PRIOR_CARE_COMMIT + ':' + file], {
        cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
      }));
    } catch (cause) {
      throw new Error('Required immutable historical client is missing: ' + PRIOR_CARE_COMMIT + '. Fetch it before the test.', { cause });
    }
  }
  return historicalSources.get(file);
}
function storage() {
  const map = new Map();
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: key => { map.delete(key); }, key: index => [...map.keys()][index] ?? null, get length() { return map.size; } };
}
export async function fictionalDevice(devices, { prior = false } = {}) {
  const win = { crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: storage(), sessionStorage: storage(), setTimeout, clearTimeout,
    addEventListener() {}, removeEventListener() {}, document: { addEventListener() {}, removeEventListener() {}, hidden: false } };
  win.window = win; win.self = win; win.top = win;
  for (const file of ['vilda_crypto.js', 'vilda_vault.js']) {
    if (prior) new Function('window', 'globalThis', historicalSource(file))(win, win);
    else loadBrowserScript(file, win);
  }
  const vault = win.VildaVault, adapter = vault.createInMemoryAdapter();
  vault.setStorageAdapter(adapter);
  const password = 'Fictional#Pr4History!' + ++serial;
  await vault.createUser(password, { iterations: 10000, label: 'Fikcyjny test zgodności planu' });
  const device = { vault, adapter, win, password, uid: vault.getCurrentUser().userId, prior };
  devices.push(device); return device;
}
export async function sharedIdentityDevice(devices, source, { prior = false, seed = true } = {}) {
  const target = await fictionalDevice(devices, { prior });
  const code = await source.vault.exportSyncCode(source.password);
  target.vault.lock('manual');
  await target.vault.importSyncCode(code, source.password, { label: 'Fikcyjna wspólna tożsamość PR4' });
  target.uid = target.vault.getCurrentUser().userId; target.password = source.password;
  if (seed) await target.vault.mergeSyncPayload(await source.vault.exportSyncPayload());
  return target;
}
export function closeDevices(devices) { for (const device of devices) device.vault.lock('manual'); }
export async function mutate(device, planId, patientId, action, extra = {}) {
  const plan = planId ? await device.vault.getCarePlan(planId) : null;
  return device.vault.mutateCarePlan({ patientId, operationId: operationId(), action,
    ...(plan ? { planId, baseRev: plan.rev } : {}), ...extra });
}
export async function fictionalPlan(device) {
  const patientId = (await device.vault.savePatient({ name: 'Fikcyjna Alicja Historia PR4',
    user: { sex: 'F', age: 12, height: 150, weight: 40 } })).patientId;
  const created = await mutate(device, null, patientId, 'create', { title: 'Fikcyjny plan zgodności PR4', goal: 'Wyłącznie fikcyjne ustalenia.' });
  if (!created.saved) throw new Error('Fictional plan creation failed.');
  const planId = created.planId;
  const first = await mutate(device, planId, patientId, 'addStep', { step: { title: 'Fikcyjne badanie z rezerwacją', kind: 'Badanie',
    state: 'pending', reminderDateISO: '2027-02-02', reminderTime: '08:15', eventDateISO: '2027-02-03', eventTime: '13:45', description: 'Fikcyjna pierwotna instrukcja.' } });
  const second = await mutate(device, planId, patientId, 'addStep', { step: { title: 'Fikcyjny niezależny krok', kind: 'Kontrola',
    state: 'pending', reminderDateISO: '2027-04-01', description: 'Fikcyjny dalszy krok.' } });
  if (!first.saved || !second.saved) throw new Error('Fictional step creation failed.');
  return { patientId, planId, stepId: first.stepId, otherStepId: second.stepId, plan: second.plan };
}
export async function ordinaryResult(device, patientId, suffix = '') {
  const saved = await device.vault.savePatientNote({ patientId, title: 'Fikcyjny oryginalny wynik ' + suffix,
    body: 'Pełna fikcyjna treść źródłowa ' + suffix + '.', category: 'wynik-badania', clinicalDateISO: '2024-02-20',
    labResult: { test: 'Fikcyjne badanie ' + suffix, value: 'Fikcyjny opis bez interpretacji' }, careContext: null });
  return device.vault.getPatientNote(saved.id);
}
export const noteIds = payload => payload.patientNotes.map(note => note.id).sort();
export const parentNote = (payload, planId) => payload.patientNotes.find(note => note.id === planId);
export const clinicalFields = note => structuredClone(Object.fromEntries(['id', 'patientId', 'title', 'body', 'category', 'dueDateISO', 'dueTime',
  'completedAtISO', 'noShowAtISO', 'clinicalDateISO', 'labResult', 'careContext', 'rev', 'createdAtISO', 'updatedAtISO'].map(key => [key, note[key]])));
export const rawNote = async (device, id) => structuredClone(await device.adapter.getPatientNoteForUser(device.uid, id));
export async function addHistory(device, fixture, count) {
  for (let index = 0; index < count; index++) {
    const result = await mutate(device, fixture.planId, fixture.patientId, 'addNote', {
      dateISO: FICTIONAL_DAY, text: 'Fikcyjne późniejsze ustalenie PR4 nr ' + index + '.' });
    if (!result.saved) throw new Error('Fictional history append failed.');
  }
  return device.vault.getCarePlan(fixture.planId);
}
