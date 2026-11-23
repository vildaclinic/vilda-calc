import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sprzatnij, urzadzenie } from './sesja-zapisu-uprzaz.mjs';
import { drugieOkno, oknoMagazynu, przechwycZadaniaWTle, zmienRekord } from '../support/okno-magazynu.mjs';

const windows = [], clone = value => JSON.parse(JSON.stringify(value));
const SOURCE = { name: 'Fikcyjna Ewa Profil Kosz', user: { firstName: 'Ewa Profil Kosz', lastName: 'Fikcyjna',
  sex: 'F', dobISO: '2016-11-03', age: 10, ageMonths: 0, measuredAtISO: '2026-11-03', height: 139, weight: 30 },
  guardian: { name: 'Fikcyjny opiekun', phone: '000-000-000', note: 'Fikcyjna informacja stała' },
  advanced: { motherHeight: 166, fatherHeight: 183, boneAgeYears: 8.5, data: { measurements: [{ ageMonths: 108, height: 132 }] } },
  perinatal: { gestationalWeeks: 34, gestationalDays: 2, birthWeightG: 1650, birthLengthCm: 41,
    headCircumferenceCm: 29, sdsSourceLabel: 'Fikcyjne zapisane źródło', catchUp: { fictional: true } },
  birth: { weeks: '34', days: '2', weight: '1650', length: '41', hasComputed: false },
  puberty: { onsetAgeYears: 9, assessment: { fictional: true } }, clinical: { downSyndrome: true } };
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-23T12:00:00Z')); });
afterEach(async () => {
  for (const device of windows.splice(0)) { device.krypto.rozbroj(); device.timery.wyczysc(); await device.locks?.zwolnijWszystkie(); }
  await sprzatnij(); vi.restoreAllMocks(); vi.useRealTimers();
});
function visit(day) { return { version: 1, visitId: crypto.randomUUID(), patientId: null,
  clinicalDateISO: day, createdAtISO: day + 'T12:00:00Z', origin: 'explicit' }; }
async function save(vault, patientId, day, data = SOURCE) {
  vi.setSystemTime(Date.now() + 60000);
  const payload = clone(data); payload.visit = visit(day); payload.user.measuredAtISO = day;
  const receipt = await vault.savePatient(payload, { patientId, dedup: false });
  return (await vault.getPatientVisits(receipt.patientId)).find(row => row.visitId === payload.visit.visitId);
}
function move(vault, row, options = {}) { return vault.moveVisitToTrash(row.patientId, row.visitId,
  { snapshotId: row.snapshotId, revision: row.rev, isCurrent: () => true, ...options }); }
async function profile(vault, patientId) { return (await vault.getPatient(patientId)).profile; }
async function memory() { const device = await urzadzenie(); device.win.__VILDA_HOME_GABINET_PREVIEW__ = true; return device; }
async function native(options = {}) {
  przechwycZadaniaWTle();
  const device = await oknoMagazynu({ konta: 'A', bramka: false, pola: { __VILDA_HOME_GABINET_PREVIEW__: true }, ...options });
  windows.push(device); return device;
}

describe('independent legacy profile retained atomically with explicit source-visit Trash', () => {
  it('does not write while browsing, and retains all profile facts when the last visit enters Trash', async () => {
    const d = await memory(), row = await save(d.v, null, '2026-11-03');
    const snapshots = clone(await d.baza.listSnapshotsForUser(d.A.userId, row.patientId));
    const before = await profile(d.v, row.patientId);
    expect(before.status).toBe('legacy'); expect(before.history).toEqual([]);
    expect(await d.baza.listPatientNotesForUser(d.A.userId)).toEqual([]);
    expect(await d.baza.listSnapshotsForUser(d.A.userId, row.patientId)).toEqual(snapshots);
    const changed = []; d.v.onPatientNoteChanged(event => changed.push(event));
    const trashed = await move(d.v, row), after = await profile(d.v, row.patientId);
    expect(after).toMatchObject({ status: 'ready', data: before.data });
    expect(after.revisionId).toMatch(/^prf-/); expect(after.history).toHaveLength(1);
    expect(after.data).not.toHaveProperty('birth'); expect(after.data.puberty).not.toHaveProperty('assessment');
    expect(await d.v.getPatientVisits(row.patientId)).toEqual([]);
    expect(await d.v.listPatientNotesForPatient(row.patientId)).toEqual([]);
    expect(await d.v.getPatientNote(after.revisionId)).toBeNull();
    expect(changed).toEqual([{ id: after.revisionId, patientId: row.patientId, action: 'save' }]);
    const raw = await d.baza.getPatientNoteForUser(d.A.userId, after.revisionId);
    expect(JSON.stringify(raw)).not.toContain(SOURCE.guardian.name);
    await d.v.restoreTrashedVisit(row.patientId, row.visitId, { trashId: trashed.trashId, isCurrent: () => true });
    expect(await profile(d.v, row.patientId)).toEqual(after);
    expect((await d.v.getPatientVisits(row.patientId))[0].payload.user).toEqual(row.payload.user);
    expect(await d.v.savePatientProfile({patientId:row.patientId, expectedRevisionId:after.revisionId, data:clone(after.data)})).toMatchObject({unchanged:true});
    expect((await profile(d.v,row.patientId)).history).toHaveLength(1);
  });

  it('preserves the clinical source instead of falling back to an older visit saved later', async () => {
    const d = await memory(), source = await save(d.v, null, '2026-11-03');
    const old = clone(SOURCE); old.advanced.motherHeight = 151; old.perinatal.birthWeightG = 2400; old.clinical.downSyndrome = false;
    const older = await save(d.v, source.patientId, '2025-01-03', old);
    const before = await profile(d.v, source.patientId);
    expect(before.data.advanced.motherHeight).toBe(166);
    await move(d.v, source);
    expect((await profile(d.v,source.patientId)).data).toEqual(before.data);
    expect((await d.v.getPatientVisits(source.patientId)).map(row=>row.visitId)).toEqual([older.visitId]);
  });

  it('does not materialize a profile when removing an unrelated old visit, and never replaces an initialized profile', async () => {
    const d = await memory(), older = await save(d.v,null,'2025-11-03'), source = await save(d.v,older.patientId,'2026-11-03');
    await move(d.v,older);
    const legacy = await profile(d.v,source.patientId);
    expect(legacy.status).toBe('legacy'); expect(legacy.history).toEqual([]);
    const data=clone(legacy.data); data.advanced.motherHeight=170;
    const explicit=await d.v.savePatientProfile({patientId:source.patientId,expectedRevisionId:legacy.revisionId,data});
    await move(d.v,source);
    expect(await profile(d.v,source.patientId)).toEqual(explicit);
  });

  it('preserves readable malformed legacy values without relaxing validation of a subsequent edit', async () => {
    const d=await memory(), malformed=clone(SOURCE); malformed.advanced.motherHeight='166,0'; malformed.user.dobISO='stary zapis daty';
    const row=await save(d.v,null,'2026-11-03',malformed), before=await profile(d.v,row.patientId);
    await move(d.v,row);
    const after=await profile(d.v,row.patientId);
    expect(after.status).toBe('ready'); expect(after.data).toEqual(before.data);
    const transported=(await d.v.exportSyncPayload()).patientNotes.find(note=>note.id===after.revisionId);
    expect(transported.profileContext.kind).toBe('patient-profile-legacy-baseline');
    await expect(d.v.savePatientProfile({patientId:row.patientId,expectedRevisionId:after.revisionId,data:after.data})).rejects.toMatchObject({code:'PATIENT_PROFILE_INVALID'});
    const fixed=clone(after.data); fixed.user.dobISO='2016-11-03'; fixed.advanced.motherHeight=166;
    const repaired=await d.v.savePatientProfile({patientId:row.patientId,expectedRevisionId:after.revisionId,data:fixed});
    expect(repaired.history).toHaveLength(2); expect(repaired.data).toEqual(fixed);
    expect(repaired.history.find(entry=>entry.revisionId===after.revisionId).data).toEqual(before.data);
  });

  it.each([{mode:'private',chmura:[],store:'patientNotes'}, {mode:'cloud-only',chmura:['A'],store:'meta'}])(
    'rolls back both profile and Trash if the $mode transaction fails', async ({chmura,store}) => {
      const d=await native({chmura}), row=await save(d.v,null,'2026-11-03'), before=await profile(d.v,row.patientId);
      const failed=d.idb.__atrapa.usterka({przy:'commit',baza:'vilda_user_'+d.A.userId,sklep:store,tryb:'readwrite',blad:'QuotaExceededError'});
      await expect(move(d.v,row)).rejects.toThrow(); expect(failed.uzyta).toBe(1);
      expect(await profile(d.v,row.patientId)).toEqual(before);
      expect(await d.v.listTrashedVisits(row.patientId)).toEqual([]);
      expect((await d.v.getPatientVisits(row.patientId)).map(item=>item.visitId)).toEqual([row.visitId]);
      expect((await d.v.exportSyncPayload()).patientNotes).toEqual([]);
      await move(d.v,row);
      expect((await profile(d.v,row.patientId)).data).toEqual(before.data);
      expect(await d.v.getPatientVisits(row.patientId)).toEqual([]);
    });

  it('emits the retained root through the established incremental note delta only after the commit succeeds', async () => {
    const d=await native({emisja:true}), row=await save(d.v,null,'2026-11-03');
    d.win.VILDA_EVENT_LOG=true;
    await move(d.v,row);
    const after=await profile(d.v,row.patientId);
    await d.ev.emissionsSettled(); await d.cisza();
    expect(d.kolejka('A').filter(entry=>entry.kind==='pnote').map(entry=>entry.entityKey)).toContain(after.revisionId);
    const delta=await d.v.buildNoteDelta(after.revisionId);
    const clear=await d.v.decryptPayloadForCurrentUser(delta.iv,delta.data);
    expect(clear.patientNotes[0].profileContext.data).toEqual(after.data);
  });

  it.each([false,true])('retains the encrypted root through sync, backup restore and patient export/import (raw baseline %s)', async raw => {
    const data=clone(SOURCE); if(raw) data.advanced.motherHeight='166,0';
    const d=await memory(), row=await save(d.v,null,'2026-11-03',data);
    await move(d.v,row); const after=await profile(d.v,row.patientId), peer=await memory();
    await peer.v.mergeSyncPayload(await d.v.exportSyncPayload());
    expect((await profile(peer.v,row.patientId)).data).toEqual(after.data);
    const exported=await d.v.exportPatientEnvelope(row.patientId), imported=await memory();
    const receipt=await imported.v.importPatientFromEnvelope(exported,d.A.haslo);
    expect((await profile(imported.v,receipt.patientId)).data).toEqual(after.data);
    const restored=await memory(); await restored.v.restoreVaultBackup(await d.v.exportVaultBackup(),d.A.haslo,{label:'Fikcyjny odzysk profilu'});
    expect((await profile(restored.v,row.patientId)).data).toEqual(after.data);
  });

  it('refuses a changed owner during preparation without materializing either half', async () => {
    const d=await memory(), row=await save(d.v,null,'2026-11-03'), before=await profile(d.v,row.patientId);
    let current=true; const gate=d.krypto.wstrzymaj('encrypt'), pending=move(d.v,row,{isCurrent:()=>current});
    const rejected=expect(pending).rejects.toThrow();
    await gate.osiagnieta; current=false; gate.zwolnij(); await rejected;
    expect(await profile(d.v,row.patientId)).toEqual(before);
    expect(await d.v.listTrashedVisits(row.patientId)).toEqual([]);
  });

  it('serializes a profile edit behind Trash without losing the newly retained root', async () => {
    const d=await native(), row=await save(d.v,null,'2026-11-03'), before=await profile(d.v,row.patientId);
    const second=await drugieOkno(d,{konta:'A',bramka:false,zaloguj:'A',pola:{__VILDA_HOME_GABINET_PREVIEW__:true}}); windows.push(second);
    const gate=d.krypto.wstrzymaj('encrypt'), pending=move(d.v,row); await gate.osiagnieta;
    const data=clone(before.data); data.guardian.name='Fikcyjny równoległy opiekun';
    const edit=second.v.savePatientProfile({patientId:row.patientId,expectedRevisionId:before.revisionId,data});
    const rejected=expect(edit).rejects.toMatchObject({code:'PATIENT_PROFILE_CONFLICT'});
    gate.zwolnij(); await pending; await rejected;
    const after=await profile(d.v,row.patientId); expect(after.data).toEqual(before.data); expect(after.history).toHaveLength(1);
  });

  it('refuses Trash atomically if an incoming profile is stored during baseline encryption', async () => {
    const d=await native(), row=await save(d.v,null,'2026-11-03'), before=await profile(d.v,row.patientId);
    const id='prf-'+crypto.randomUUID(), data=clone(before.data); data.guardian.name='Fikcyjna wersja przychodząca';
    const encrypted=await d.v.encryptPayloadForCurrentUser({title:'Rewizja kartoteki pacjenta',body:'Fikcyjny import równoległy',
      profileContext:{schemaVersion:1,kind:'patient-profile',parents:[],legacyRevisionId:before.revisionId,data}});
    const stamp=new Date().toISOString(), imported={id,patientId:row.patientId,category:'observation',bodyCipher:encrypted,
      createdAtISO:stamp,updatedAtISO:stamp,rev:1,dueDateISO:null,linkedAgeMonths:null};
    const gate=d.krypto.wstrzymaj('encrypt'), pending=move(d.v,row);
    const rejected=expect(pending).rejects.toMatchObject({code:'PATIENT_PROFILE_CONFLICT'});
    await gate.osiagnieta;
    // Simulate a foreign transport/older writer which does not participate in
    // this operation's patient lease. The final IndexedDB transaction must CAS.
    await zmienRekord(d.idb,'vilda_user_'+d.A.userId,'patientNotes',id,()=>imported);
    gate.zwolnij(); await rejected;
    expect((await profile(d.v,row.patientId))).toMatchObject({status:'ready',revisionId:id,data});
    expect((await d.v.getPatientVisits(row.patientId)).map(item=>item.visitId)).toEqual([row.visitId]);
    expect(await d.v.listTrashedVisits(row.patientId)).toEqual([]);
    expect((await d.v.exportSyncPayload()).patientNotes.map(note=>note.id)).toEqual([id]);
  });

  it.each([false,true])('deduplicates equal automatic roots and preserves different offline facts (divergent %s)', async divergent => {
    const first=await memory(), row=await save(first.v,null,'2026-11-03'), second=await memory();
    await second.v.mergeSyncPayload(await first.v.exportSyncPayload());
    const before=await profile(first.v,row.patientId);
    expect((await profile(second.v,row.patientId)).revisionId).toBe(before.revisionId);
    if(divergent) {
      const [current]=await second.v.getPatientVisits(row.patientId), payload=clone(current.payload);
      payload.advanced.motherHeight=171;
      await second.v.updateSnapshotPayload(row.patientId,current.snapshotId,payload,{expectedVisit:{
        visitId:current.visitId,revision:current.rev,isCurrent:()=>true}});
    }
    await move(first.v,row);
    vi.setSystemTime(Date.now()+60000);
    await move(second.v,(await second.v.getPatientVisits(row.patientId))[0]);
    const a=await profile(first.v,row.patientId), b=await profile(second.v,row.patientId);
    if(divergent) expect(a.revisionId).not.toBe(b.revisionId);
    else expect(a.revisionId).toBe(b.revisionId);
    const roots=await Promise.all([first.v,second.v].map(async vault=>(await vault.exportSyncPayload()).patientNotes));
    if(divergent) expect(roots[0][0].profileContext).not.toEqual(roots[1][0].profileContext);
    else expect(roots[0][0].profileContext).toEqual(roots[1][0].profileContext);
    expect(roots[0][0].body).toBe(roots[1][0].body);
    expect(roots[0][0].createdAtISO).not.toBe(roots[1][0].createdAtISO);
    await first.v.mergeSyncPayload(await second.v.exportSyncPayload());
    await second.v.mergeSyncPayload(await first.v.exportSyncPayload());
    for(const vault of [first.v,second.v]) {
      const after=await profile(vault,row.patientId);
      if(divergent) {
        expect(after.status).toBe('conflict'); expect(after.history).toHaveLength(2);
        expect(after.heads.slice().sort()).toEqual([a.revisionId,b.revisionId].sort());
        expect(after.history.map(entry=>entry.data.advanced.motherHeight).sort()).toEqual([166,171]);
      } else {
        expect(after).toMatchObject({status:'ready',revisionId:a.revisionId,data:before.data});
        expect(after.history).toHaveLength(1); expect(after.heads).toEqual([a.revisionId]);
      }
    }
  });
});
