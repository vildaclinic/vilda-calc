import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Zgłoszenie właściciela 2026-09-05: skasowanie szablonu na jednym urządzeniu nie usuwało go
// z drugiego. W logu synchronizacji: scalenie przechodzi, etag się zmienia, żadnego błędu,
// a `deletedNoteCount: 0`.
//
// Mechanizm (zmierzony): scalanie przyjmuje nagrobek tylko wtedy, gdy jest NIE STARSZY niż
// najnowsza znana aktualizacja notatki — `R[id] >= Y[id]`, gdzie Y bierze `updatedAtISO`
// z obu stron. `removeNote` stemplowało nagrobek surowym „teraz" z zegara urządzenia
// kasującego. Gdy notatkę zapisano na urządzeniu z zegarem do przodu, to „teraz" wypada
// PRZED jej `updatedAtISO` i nagrobek przegrywa — po cichu, bez błędu, z zerowym licznikiem.
//
// Zmierzone przed poprawką: wystarczą 2 SEKUNDY różnicy zegarów. Szablon zostaje u odbiorcy
// i dodatkowo WRACA na urządzeniu kasującym przy następnym scaleniu.
//
// Poprawka: znacznik kasowania nie może być starszy niż wersja, którą kasuje —
// `deletedAtISO = max(teraz, updatedAtISO kasowanej notatki)`. To samo w `removePatientNote`.

function makeStorage(){const m=Object.create(null);return{getItem:k=>k in m?m[k]:null,setItem:(k,v)=>{m[k]=String(v)},removeItem:k=>{delete m[k]},key:i=>Object.keys(m)[i]||null,get length(){return Object.keys(m).length}}}
function loadDevice(){
  const win={crypto:globalThis.crypto,TextEncoder,TextDecoder,btoa:globalThis.btoa,atob:globalThis.atob,
    localStorage:makeStorage(),sessionStorage:makeStorage(),
    setTimeout:setTimeout.bind(globalThis),clearTimeout:clearTimeout.bind(globalThis),
    addEventListener(){},removeEventListener(){},
    document:{addEventListener(){},removeEventListener(){},hidden:false}};
  win.window=win;win.self=win;win.top=win;
  loadBrowserScript('vilda_crypto.js',win); loadBrowserScript('vilda_vault.js',win);
  const vault=win.VildaVault; vault.setStorageAdapter(vault.createInMemoryAdapter());
  return vault;
}
let n=0;
async function dev(label){const v=loadDevice();n++;await v.createUser(`Repro#Zegar2026!${label}${n}`,{label,iterations:10000});return v}
const syncTo=async(t,s)=>t.mergeSyncPayload(await s.exportSyncPayload());
const tytuly=async(v)=>(await v.listNotes()).map(x=>x.title).sort();

// Zegar jednego urzadzenia przesuniety do przodu -- zwykla rzecz przy telefonie i komputerze.
function zZegarem(przesuniecieMs, fn){
  const OrgDate = Date;
  class PrzesuniętaData extends OrgDate {
    constructor(...a){ if(a.length===0){ super(OrgDate.now()+przesuniecieMs); } else { super(...a); } }
    static now(){ return OrgDate.now()+przesuniecieMs; }
  }
  globalThis.Date = PrzesuniętaData;
  return Promise.resolve().then(fn).finally(()=>{ globalThis.Date = OrgDate; });
}

// P-NOTATKI rata 2 (G13, audyt „Dodaj notatkę do wizyty" 2026-09-18): ten plik jest w
// ALGORITHMS.md wskazany jako strażnik poprawki zegara dla OBU rodzajów notatek, a sprawdzał
// wyłącznie bibliotekę szablonów (saveNote/removeNote). Zmierzone: z `Eb` (removePatientNote)
// cofniętym do surowego „teraz" cały pakiet przechodził na zielono, a notatka pacjenta
// skasowana na urządzeniu z prawidłowym zegarem wracała. Poniżej ta sama pętla przesunięć
// dla savePatientNote/removePatientNote/listAllPatientNotes.
const notatkiPacjenta = async (v) => (await v.listAllPatientNotes()).map((x) => x.title).sort();

describe('kasowanie notatki PACJENTA kontra zegar drugiego urzadzenia', () => {
  for (const przesuniecieS of [300, 60, 10, 2]) {
    it(`przesuniecie zegara ${przesuniecieS} s`, async () => {
      const A = await dev('PA' + przesuniecieS), B = await dev('PB' + przesuniecieS);
      const pacjent = await B.savePatient({ name: 'Fikcyjny Pacjent', sex: 'K', age: 7, height: 122, weight: 24 });
      let id = null;
      await zZegarem(przesuniecieS * 1000, async () => {
        id = (await B.savePatientNote({
          patientId: pacjent.patientId, title: 'Notatka Z', body: 'tresc', category: 'observation',
        })).id;
      });
      await syncTo(A, B);
      expect(await notatkiPacjenta(A)).toEqual(['Notatka Z']);

      await A.removePatientNote(id);                // kasowanie na urzadzeniu z prawidlowym zegarem
      const uB = await B.mergeSyncPayload(await A.exportSyncPayload());
      const uA = await A.mergeSyncPayload(await B.exportSyncPayload());
      console.log(`   pacjent, przesuniecie ${String(przesuniecieS).padStart(4)} s ->`,
        'deletedPatientNoteCount u B =', uB.deletedPatientNoteCount,
        '| notatka u B:', (await notatkiPacjenta(B)).length,
        '| notatka WRACA u A:', (await notatkiPacjenta(A)).length > 0,
        '| uA:', uA.deletedPatientNoteCount);
      expect(await notatkiPacjenta(B), 'kasowanie ma dotrzec do B').toEqual([]);
      expect(await notatkiPacjenta(A), 'notatka nie moze wrocic u A').toEqual([]);
    });
  }
});

describe('kasowanie kontra zegar drugiego urzadzenia', () => {
  for (const przesuniecieS of [300, 60, 10, 2]) {
    it(`przesuniecie zegara ${przesuniecieS} s`, async () => {
      const A=await dev('A'+przesuniecieS), B=await dev('B'+przesuniecieS);
      let id=null;
      await zZegarem(przesuniecieS*1000, async () => {
        id = (await B.saveNote({title:'Szablon Z',category:'wlasne',body:'tresc'})).id;
      });
      await syncTo(A,B);
      expect(await tytuly(A)).toEqual(['Szablon Z']);

      await A.removeNote(id);                       // kasowanie na urzadzeniu z prawidlowym zegarem
      const uB = await B.mergeSyncPayload(await A.exportSyncPayload());
      const uA = await A.mergeSyncPayload(await B.exportSyncPayload());
      console.log(`   przesuniecie ${String(przesuniecieS).padStart(4)} s ->`,
        'deletedNoteCount u B =', uB.deletedNoteCount,
        '| szablon u B:', (await tytuly(B)).length,
        '| szablon WRACA u A:', (await tytuly(A)).length > 0);
      expect(await tytuly(B), 'kasowanie ma dotrzec do B').toEqual([]);
    });
  }
});
