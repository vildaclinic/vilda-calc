import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const source = readFileSync(new URL('../../vilda_home_encounter.js', import.meta.url), 'utf8');
function storage() {
  const data = new Map();
  return {getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key), key: index => [...data.keys()][index] ?? null, get length() { return data.size; }};
}
async function device() {
  const doc = {addEventListener() {}, removeEventListener() {}, hidden:false, getElementById: key => key === 'sex' ? {value:fieldSex} : null};
  const win = {crypto:globalThis.crypto, TextEncoder, TextDecoder, btoa, atob, localStorage:storage(), sessionStorage:storage(),
    setTimeout, clearTimeout, addEventListener() {}, removeEventListener() {}, document:doc, __VILDA_HOME_GABINET_PREVIEW__:true};
  win.window = win; win.self = win; win.top = win;
  win.localStorage.setItem('vildaRetention','0');
  for (const script of ['vilda_crypto.js','vilda_retention.js','vilda_vault.js','vilda_visit_context.js','vilda_ds_source.js','vilda_home_visit_comparison_model.js','vilda_bone_age.js']) loadBrowserScript(script, win);
  const vault = win.VildaVault, adapter = vault.createInMemoryAdapter(); vault.setStorageAdapter(adapter);
  await vault.createUser('Fictional#Visits!2026Aa', {label:'Fictional rapid intake',iterations:10000});
  let fieldSex = '';
  const draft = {name:'Testowa Osoba',user:{firstName:'Osoba',lastName:'Testowa',age:12,ageMonths:1,height:145,weight:35,sex:'M'},
    advanced:{motherHeight:170},plan:{palFactor:1.6}};
  win.VildaDataImportExport = {getSaveReadiness:()=>({ready:true}),captureCurrentUserDataReadOnly:()=>structuredClone(draft),
    _ensureCurrentMeasurementInHistory() {}};
  new Function('window','document',source)(win, doc);
  function begin() { return {session:vault.captureSyncOperationSession(),visit:win.VildaVisitContext.beginNew({clinicalDateISO:'2026-11-22'}),isCurrent:()=>true}; }
  return {vault, adapter, win, draft, begin, sex:val=>{fieldSex=val;}, save:options => win.VildaRapidPatientSave.save(options)};
}
describe('Szybka ścieżka — zapis w sejfie', () => {
  it('commits anonymous analysis as one patient/one visit, with no inferred DOB or sex, and coalesces two clicks', async () => {
    const d = await device(), input = d.begin();
    expect(await d.vault.listPatients()).toEqual([]);
    const [a,b] = await Promise.all([d.save(input),d.save(input)]);
    expect(a).toEqual(b);
    expect(await d.save(input)).toEqual(a);
    const [row] = await d.vault.getPatientVisits(a.patientId);
    expect(row.payload).toMatchObject({user:{sex:'',age:12,ageMonths:1},advanced:{motherHeight:170},plan:{palFactor:1.6},visit:{visitId:input.visit.visitId,patientId:a.patientId}});
    expect(row.payload.user).not.toHaveProperty('dobISO');
    expect((await d.vault.listPatients())[0].snapshotCount).toBe(1);
  });
  it('requires an explicit homonym choice, reconciles DOB and sex before attachment, and retains the previous visit', async () => {
    const d = await device();
    const patient = await d.vault.savePatient({name:'Testowa Osoba',user:{firstName:'Osoba',lastName:'Testowa',age:4,sex:'K',dobISO:'2014-10-22'},
      guardian:{name:'Opiekun'},advanced:{fatherHeight:181},plan:{palFactor:1.4}}, {dedup:false});
    const input = d.begin(), select = {patientId:patient.patientId};
    const result = await d.save(input);
    expect(result).toMatchObject({status:'choose',candidates:[{patientId:patient.patientId,mismatch:true,sex:'F',age:12,ageMonths:1}]});
    expect(await d.save({...input,choice:select})).toMatchObject({status:'mismatch'});
    expect(await d.vault.getPatientVisits(patient.patientId)).toHaveLength(1);
    d.sex('F');
    expect((await d.save({...input,choice:select})).patientId).toBe(patient.patientId);
    const rows = await d.vault.getPatientVisits(patient.patientId);
    expect(rows).toHaveLength(2);
    expect(rows.find(row=>row.visitId===input.visit.visitId).payload).toMatchObject({guardian:{name:'Opiekun'},advanced:{motherHeight:170,fatherHeight:181},user:{dobISO:'2014-10-22',sex:'F'}});
    const another = await d.save({...d.begin(),choice:{newPatient:true}});
    expect(another.patientId).not.toBe(patient.patientId);
    expect(await d.vault.listPatients()).toHaveLength(2);
  });
  it('aborts a stale commit before either encrypted row is visible and permits a clean retry', async () => {
    const d = await device(), options = d.begin();
    let active = true;
    options.isCurrent = () => active;
    const commit = d.adapter.commitRapidVisitForUser.bind(d.adapter);
    d.adapter.commitRapidVisitForUser = (...args) => {active = false; return commit(...args);};
    await expect(d.save(options)).rejects.toThrow();
    expect(await d.vault.listPatients()).toHaveLength(0);
    expect((await d.vault.exportSyncPayload()).patients).toHaveLength(0);
    active = true; d.adapter.commitRapidVisitForUser = commit;
    expect((await d.save(options)).status).toBe('saved');
  });
  it('serializes automatic new records for a shared name and never switches an owner', async () => {
    const d = await device(), first = d.begin(), second = d.begin();
    const results = await Promise.allSettled([d.save(first),d.save(second)]);
    expect(results.filter(row=>row.status==='fulfilled' && row.value.status==='saved')).toHaveLength(1);
    expect(await d.vault.listPatients()).toHaveLength(1);
    const other = d.begin(); d.win.sessionStorage.setItem('vildaCurrentPatientId','different');
    expect(()=>d.save(other)).toThrow();
  });
});

it('adds an infant visit without a birth date and carries history from the newest clinical visit even after a backdated entry', async () => {
  const d = await device();
  d.draft.user = {...d.draft.user, age:0, ageMonths:3, height:60, weight:5.8};
  function prior(day, months, fatherHeight) {
    const visit = d.win.VildaVisitContext.beginNew({clinicalDateISO:day});
    return {name:d.draft.name, visit, user:{...d.draft.user, sex:'', ageMonths:months, measuredAtISO:day},
      advanced:{fatherHeight}, guardian:{name:'Opiekun '+months}};
  }
  const newer = await d.vault.savePatient(prior('2026-11-01', 2, 183), {dedup:false});
  const backdated = await d.vault.savePatient(prior('2026-10-01', 1, 169), {patientId:newer.patientId});
  const original = await d.vault.getPatientVisits(newer.patientId);
  expect(original.map(row => row.snapshotId)).toEqual([newer.snapshotId,backdated.snapshotId]);
  expect((await d.vault.getLatestSnapshot(newer.patientId)).snapshotId).toBe(backdated.snapshotId);
  const input = d.begin(), match = await d.save(input);
  expect(match).toMatchObject({status:'choose',candidates:[{patientId:newer.patientId, dobISO:'', mismatch:false}]});
  const result = await d.save({...input,choice:{patientId:newer.patientId}});
  expect(result).toMatchObject({status:'saved',patientId:newer.patientId});
  const [current,...previous] = await d.vault.getPatientVisits(newer.patientId);
  expect(previous).toEqual(original);
  expect(current.payload).toMatchObject({guardian:{name:'Opiekun 2'},advanced:{fatherHeight:183},
    user:{age:0,ageMonths:3,height:60,weight:5.8}});
  expect(current.payload.user).not.toHaveProperty('dobISO');
});

it('checks the clinical source inside the atomic commit, including legacy records without updatedAtISO', async () => {
  const d = await device(), previous = await d.save(d.begin()), account = d.vault.getCurrentUser().userId;
  const raw = await d.adapter.getSnapshotForUser(account, previous.snapshotId);
  delete raw.updatedAtISO;
  await d.adapter.putSnapshotForUser(account, raw);
  const options = {...d.begin(), choice:{patientId:previous.patientId}};
  const commit = d.adapter.commitRapidVisitForUser.bind(d.adapter);
  d.adapter.commitRapidVisitForUser = async (user, change) => {
    await d.adapter.putSnapshotForUser(account, {...raw, rev:raw.rev+1});
    return commit(user, change);
  };
  await expect(d.save(options)).rejects.toThrow('Dane ostatniej wizyty');
  expect(await d.vault.getPatientVisits(previous.patientId)).toHaveLength(1);
  d.adapter.commitRapidVisitForUser = commit;
  expect((await d.save(options)).status).toBe('saved');
  expect(await d.vault.getPatientVisits(previous.patientId)).toHaveLength(2);
});
