// Apply this public layer to the exact reviewed patient-treatment image. This
// keeps the older native integration seals independently reproducible.
import { restoreRapidVisitBaseline } from './rapid-visit-vault-delta.mjs';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const digest = value => createHash('sha256').update(value).digest('hex');
const BASE = '09bbfa63c1bc4561edc3be2f8cd522abeef3a36260af0f2eff47db08b49d962f';
const RESULT = '628f569396f085f1676c46abc5ac22de280eb97dd68092efb8121feee6793e67';
const CORE = 'e3a3f1d4d5f746d4b8d78c4382bb55bd767d507b714c97e77a0c3950916e6f50';
function fail(message) { throw new Error('Whole visit trash boundary: ' + message); }
function hooks(root) {
  const fragment = readFileSync(resolve(root, 'runtime/visit-trash-v1/vault-fragment.js'), 'utf8');
  if (digest(fragment) !== CORE) fail('readable source differs');
  const priorDb = "async commitCarePlanForUser(user, change) {PatientClinicalGuard(user);\n  const db = await r(user);";
  const priorMemory = "async commitCarePlanForUser(user, change) {PatientClinicalGuard(user);\n  const store = s(user),";
  const hybrid = 'function ba(t,e){const Bpc_h=Bpc_hybryda(t,e);return{';
  const list = 'async function Bvisit_list(patientId) {';
  const visit = 'if (!Bvisit_valid(visit)) return;\n    let group = groups.get(visit.visitId);';
  const save = 'async function Bvisit_save(payload, patientId, latest, savedAtISO) {';
  const trash = '    const rekord = await I().getPatientForUser(b, e.patientId);\n    let naglowek = null;';
  const originalEntry = '    const e = (await Bkz_czytaj()).find(function (x) { return PatientClinicalWriteValue(PatientClinicalOperationAccount,x.snapshotId === snapshotId && x.patientId === patientId); });';
  const recover = '    try { tresc = await G(e.payloadCipher.iv, e.payloadCipher.data); st = Bgw_stan(e, tresc); } catch(PatientClinicalCaught) {PatientClinicalRethrow(PatientClinicalCaught); tresc = null; }';
  const headerRead = '  const stored = await I().listPatientsForUser(b), patients = [];\n  VaultStrictReadAssert(session);';
  const count = 'patients.push({ patientId: patient.patientId, header: header, snapshotCount: patient.snapshotCount || 0,';
  return [
    [headerRead, headerRead + '\n  const identities = await VisitTrashIdentityCounts(session);'],
    [count, count.replace('patient.snapshotCount || 0', 'Math.max(0, (patient.snapshotCount || 0) - (identities.get(patient.patientId) || 0))')],
    [priorDb, 'async listVisitIdentitiesForUser(user) { const db = await r(user); return t(db.transaction(It, "readonly").objectStore(It).getAll(IDBKeyRange.bound(VISIT_IDENTITY_PREFIX, VISIT_IDENTITY_PREFIX + "\\uffff"))); },\ncommitVisitTrashForUser(user, change, stagePatient) { return VisitTrashDatabase(user, change, stagePatient, r); },\n' + priorDb],
    [priorMemory, `async listVisitIdentitiesForUser(user) { return Array.from(s(user).snapshots.values()).filter(row => row.snapshotId.startsWith(VISIT_IDENTITY_PREFIX)); },
stageVisitTrashForUser(user, change) { return VisitTrashStage(user, change, s(user), d); },
async commitVisitTrashForUser(user, change, stagePatient) {
  PatientClinicalGuard(user);
  const store = s(user), meta = VisitTrashNextMeta(change, store.meta);
  if (stagePatient) {
    const applyPatient = stagePatient();
    store.meta = meta; d(); applyPatient();
  } else this.stageVisitTrashForUser(user, change)(meta);
  return true;
},
` + priorMemory],
    [hybrid, hybrid + 'listVisitIdentitiesForUser(user){return e.listVisitIdentitiesForUser(user);},commitVisitTrashForUser(user, change){return t.commitVisitTrashForUser(user, change, () => e.stageVisitTrashForUser(user, change));},'],
    [list, fragment + '\n' + list],
    [visit, visit.replace('!Bvisit_valid(visit)', '!Bvisit_valid(visit) || VisitTrashIdentity(snapshot)')],
    [save, save + `
  if ('_visitPatientIdentityOnly' in payload || '_visitTrashGroup' in payload) {
    payload = Object.assign({}, payload);
    delete payload._visitPatientIdentityOnly; delete payload._visitTrashGroup;
  }`],
    [trash, '    if (tresc && tresc._visitTrashGroup) continue;\n' + trash],
    [originalEntry, '    const trashEntries = await Bkz_czytaj();\n' + originalEntry.replace('(await Bkz_czytaj())', 'trashEntries')],
    [recover, recover + "\n    if (await VisitTrashBlocksSingle(e, tresc, trashEntries, pilnuj)) throw Bkz_blad('Najpierw przywróć całą wizytę z Kosza wizyt.', 'VISIT_TRASH_GROUP');"],
    ['getPatient:ct,getPatientVisits:Bvisit_list,getLatestSnapshot:hr,', `getPatient:VisitTrashPublicPatient,getPatientVisits:Bvisit_list,getLatestSnapshot:VisitTrashLatest,
isPatientIdentitySnapshot:VisitTrashIdentity,
moveVisitToTrash:(patientId,visitId,options)=>VisitTrashChange(patientId,visitId,options,false),
listTrashedVisits:VisitTrashList,
restoreTrashedVisit:(patientId,visitId,options)=>VisitTrashChange(patientId,visitId,options,true),
`],
  ];
}
function change(source, before, after) {
  if (source.split(before).length !== 2) fail('missing or ambiguous hook');
  return source.replace(before, () => after);
}
export function applyVisitTrashDelta(source, root = ROOT) {
  if (digest(source) !== BASE) fail('unexpected input image');
  for (const [before, after] of hooks(root)) source = change(source, before, after);
  if (digest(source) !== RESULT) fail('unexpected generated image');
  return source;
}
export function restoreVisitTrashBaseline(source, root = ROOT) {
  source = restoreRapidVisitBaseline(source, root);
  if (!source.includes('/* BEGIN VILDA WHOLE VISIT TRASH V1 */')) return source;
  if (digest(source) !== RESULT) fail('unexpected published image');
  for (const [before, after] of hooks(root).reverse()) source = change(source, after, before);
  if (digest(source) !== BASE) fail('unrelated vault change');
  return source;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length === 3 && args[0] === '--rebuild') {
    writeFileSync(resolve(args[2]), applyVisitTrashDelta(readFileSync(resolve(args[1]), 'utf8')));
  } else if (!args.length) {
    const source = restoreRapidVisitBaseline(readFileSync(resolve(ROOT, 'vilda_vault.js'), 'utf8'));
    if (applyVisitTrashDelta(restoreVisitTrashBaseline(source)) !== source) fail('round trip differs');
    process.stdout.write('Whole visit trash: readable source and exact vault revision verified.\n');
  } else fail('usage: node tools/visit-trash-vault-delta.mjs [--rebuild BASE_FILE OUTPUT_FILE]');
}
