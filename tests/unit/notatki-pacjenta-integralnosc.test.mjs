import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { zrodlo } from '../support/silnik-bmi.mjs';

// P-NOTATKI rata 1 (audyt „Dodaj notatkę do wizyty", 2026-09-18) — integralność notatek PACJENTA
// na PRAWDZIWYM sejfie (vilda_vault.js + vilda_crypto.js w adapterze pamięciowym). Każdy test
// odtwarza scenariusz z audytu, zmierzony czerwony przed poprawką:
//  G2  usunięcie pacjenta zostawiało notatki w sejfie i w chmurze (okno obiecuje ich usunięcie),
//  G3  re-import karty .wiw po usunięciu nie kasował nagrobka pacjenta — pacjent znikał po pull,
//  D2  sejf przyjmował notatkę do usuniętego pacjenta (niewidoczna wszędzie, wracała przy imporcie),
//  G6  wskrzeszenie notatki (P5 „Zostaw notatkę") zerowało rev — nowsza treść przegrywała,
//  G12 nieodszyfrowalna notatka wychodziła z urządzenia jako „(błąd odczytu)" i nadpisywała treść,
//  G5  scalenie duplikatów + równoległa edycja wracały notatkę pod usunięte źródło.
// Dane wyłącznie FIKCYJNE.

function makeStorage() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; }, key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
  };
}

let licznik = 0;
async function dev(label) {
  const win = {
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: makeStorage(), sessionStorage: makeStorage(),
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {}, removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
  };
  win.window = win; win.self = win; win.top = win;
  loadBrowserScript('vilda_crypto.js', win); loadBrowserScript('vilda_vault.js', win);
  const vault = win.VildaVault;
  const adapter = vault.createInMemoryAdapter();
  vault.setStorageAdapter(adapter);
  licznik += 1;
  await vault.createUser(`Notatki#Rata1!${label}${licznik}`, { label, iterations: 10000 });
  return { vault, adapter, uid: vault.getCurrentUser().userId };
}

const sync = async (cel, zrodlo) => cel.vault.mergeSyncPayload(await zrodlo.vault.exportSyncPayload());
const PACJENT = { name: 'Testowy Fikcyjny-Notatka', user: { sex: 'M', age: 8, ageMonths: 2, height: 126, weight: 26 } };
const idPacjenta = (p) => p.patientId || p.id;

describe('G2 — usunięcie pacjenta zabiera jego notatki (decyzja właściciela: tak, jak obiecuje okno)', () => {
  it('notatki znikają lokalnie, mają nagrobki i znikają na drugim urządzeniu po synchronizacji', async () => {
    const A = await dev('A'), B = await dev('B');
    const pid = idPacjenta(await A.vault.savePatient(PACJENT));
    await A.vault.savePatientNote({ patientId: pid, title: 'Kontrola wzrostu', body: 'zalecenia' });
    await sync(B, A);
    expect((await B.vault.listAllPatientNotes()).length, 'kontrola: notatka dotarła na B').toBe(1);

    await A.vault.removePatient(pid);
    expect(await A.vault.listAllPatientNotes(), 'lokalnie notatek już nie ma').toEqual([]);
    expect((await A.vault.exportSyncPayload()).patientNotes, 'nie jadą też w ładunku synchronizacji').toEqual([]);

    await sync(B, A);
    expect(await B.vault.listAllPatientNotes(), 'kasowanie doszło na drugie urządzenie').toEqual([]);
  });

  it('notatki modułów (pseudopacjent Terminarza) zostają nietknięte', async () => {
    const A = await dev('A');
    const pid = idPacjenta(await A.vault.savePatient(PACJENT));
    await A.vault.savePatientNote({ patientId: pid, title: 'Kontrola' });
    await A.vault.savePatientNote({ patientId: A.vault.ACTIVITY_PATIENT_ID, title: 'Dyżur nocny', category: 'duty', dueDateISO: '2026-09-20' });
    await A.vault.removePatient(pid);
    const zostaly = await A.vault.listAllPatientNotes();
    expect(zostaly.map((n) => n.title)).toEqual(['Dyżur nocny']);
  });
});

describe('G3 — re-import karty pacjenta po usunięciu', () => {
  it('pacjent zostaje po imporcie także po pierwszej synchronizacji (nagrobek skasowany)', async () => {
    const A = await dev('A'), pusty = await dev('P');
    const pid = idPacjenta(await A.vault.savePatient(PACJENT));
    await A.vault.savePatientNote({ patientId: pid, title: 'Kontrola wzrostu' });
    const koperta = await A.vault.exportPatientEnvelope(pid);

    await A.vault.removePatient(pid);
    expect(await A.vault.listPatients()).toEqual([]);

    const imp = await A.vault.importPatientFromEnvelope(koperta);
    expect(imp.isNew).toBe(true);
    expect((await A.vault.listPatients()).length, 'pacjent wrócił po imporcie').toBe(1);

    expect((await A.vault.listAllPatientNotes()).map((n) => n.title), 'notatki wróciły razem z kartą').toEqual(['Kontrola wzrostu']);

    await sync(A, pusty); // pierwsze pobranie: lokalne nagrobki nie mogą skasować tego, co właśnie przywrócono
    expect((await A.vault.listPatients()).length, 'i zostaje po synchronizacji').toBe(1);
    expect((await A.vault.listAllPatientNotes()).length, 'notatki też zostają').toBe(1);
  });
});

describe('D2 — notatka nie trafia do usuniętego pacjenta', () => {
  it('zapis odmawia z czytelnym komunikatem, a pseudopacjenci modułów działają dalej', async () => {
    const A = await dev('A');
    const pid = idPacjenta(await A.vault.savePatient(PACJENT));
    await A.vault.removePatient(pid);
    await expect(A.vault.savePatientNote({ patientId: pid, title: 'Kontrola' })).rejects.toThrow(/usuni/i);
    await expect(A.vault.savePatientNote({ patientId: A.vault.ACTIVITY_PATIENT_ID, title: 'Urlop', category: 'absence', dueDateISO: '2026-09-21' })).resolves.toBeTruthy();
  });
});

describe('G6 — wskrzeszenie notatki nie cofa numeru wersji', () => {
  it('po „Zostaw notatkę" nowsza treść wygrywa ze starszą wersją z drugiego urządzenia', async () => {
    const A = await dev('A'), B = await dev('B');
    const pid = idPacjenta(await A.vault.savePatient(PACJENT));
    const n = await A.vault.savePatientNote({ patientId: pid, title: 'Notatka', body: 'wersja 1' });
    await A.vault.savePatientNote({ id: n.id, patientId: pid, title: 'Notatka', body: 'wersja 2' });
    await sync(B, A);
    expect((await B.vault.listAllPatientNotes())[0].body, 'kontrola: B ma wersję 2').toBe('wersja 2');

    await A.vault.removePatientNote(n.id);
    const wskrzeszona = await A.vault.savePatientNote({ id: n.id, patientId: pid, title: 'Notatka', body: 'wersja 3 po wskrzeszeniu' });
    expect(wskrzeszona.isNew, 'to jest ścieżka P5 — sejf zgłasza wskrzeszenie').toBe(true);

    await sync(B, A);
    expect((await B.vault.listAllPatientNotes())[0].body, 'dopisek z urządzenia wskrzeszającego nie ginie').toBe('wersja 3 po wskrzeszeniu');
  });
});

describe('G12 — nieodszyfrowalna notatka zostaje na urządzeniu', () => {
  async function uszkodz(D, id) {
    const rekordy = await D.adapter.listPatientNotesForUser(D.uid);
    const r = rekordy.find((x) => x.id === id);
    await D.adapter.putPatientNoteForUser(D.uid, Object.assign({}, r, { bodyCipher: { iv: 'AAAAAAAAAAAAAAAA', data: 'AAAAAAAAAAAAAAAAAAAAAAAA' } }));
  }

  it('nie wychodzi deltą ani pełnym ładunkiem i nie nadpisuje czytelnej kopii na drugim urządzeniu', async () => {
    const A = await dev('A'), B = await dev('B');
    const pid = idPacjenta(await A.vault.savePatient(PACJENT));
    const n = await A.vault.savePatientNote({ patientId: pid, title: 'Notatka', body: 'dobra treść' });
    await sync(B, A);
    await A.vault.savePatientNote({ id: n.id, patientId: pid, title: 'Notatka', body: 'nowsza treść' });
    await uszkodz(A, n.id);

    expect(await A.vault.buildNoteDelta(n.id), 'delta nie powstaje dla uszkodzonej notatki').toBeNull();
    const ladunek = await A.vault.exportSyncPayload();
    expect(ladunek.patientNotes.map((x) => x.id), 'uszkodzona notatka nie jedzie w pełnym ładunku').not.toContain(n.id);

    await B.vault.mergeSyncPayload(ladunek);
    expect((await B.vault.listAllPatientNotes())[0].body, 'B zachowuje swoją czytelną kopię').toBe('dobra treść');
  });

  it('kontrola pozytywna: czytelna notatka nadal jedzie i deltą, i ładunkiem', async () => {
    const A = await dev('A');
    const pid = idPacjenta(await A.vault.savePatient(PACJENT));
    const n = await A.vault.savePatientNote({ patientId: pid, title: 'Notatka', body: 'treść' });
    expect(await A.vault.buildNoteDelta(n.id)).toBeTruthy();
    expect((await A.vault.exportSyncPayload()).patientNotes.map((x) => x.id)).toContain(n.id);
  });
});

describe('G5 — scalenie duplikatów kontra równoległa edycja notatki', () => {
  it('notatka zostaje pod rekordem docelowym, a nie wraca pod usunięte źródło', async () => {
    const A = await dev('A'), B = await dev('B');
    const zrodlo = idPacjenta(await A.vault.savePatient({ name: 'Testowa Fikcyjna-Duplikat', user: { sex: 'F', age: 9, ageMonths: 0, height: 132, weight: 29 } }, { dedup: false }));
    const cel = idPacjenta(await A.vault.savePatient({ name: 'Testowa Fikcyjna-Duplikat', user: { sex: 'F', dobISO: '2017-03-04', age: 9, ageMonths: 6, height: 134, weight: 30 } }, { dedup: false, forceNew: true }));
    const n = await A.vault.savePatientNote({ patientId: zrodlo, title: 'Kontrola za 6 mies.', dueDateISO: '2027-03-01' });
    await sync(B, A);

    await A.vault.mergePatients(zrodlo, cel);
    expect((await A.vault.listAllPatientNotes())[0].patientId, 'kontrola: scalenie przepięło notatkę').toBe(cel);

    // B (offline, bez wiedzy o scaleniu) przesuwa termin w tej samej notatce.
    // Odstęp 5 ms: obie strony kończą na tym samym `rev`, więc rozstrzyga `updatedAtISO`,
    // a znacznik ma rozdzielczość milisekundy — bez odstępu wynik zależałby od obciążenia maszyny.
    await new Promise((r) => setTimeout(r, 5));
    await B.vault.savePatientNote({ id: n.id, patientId: zrodlo, title: 'Kontrola za 6 mies.', dueDateISO: '2027-04-01' });
    await sync(A, B);

    const poScaleniu = (await A.vault.listAllPatientNotes())[0];
    expect(String(poScaleniu.dueDateISO), 'treść/termin z ostatniego zapisu').toContain('2027-04-01');
    expect(poScaleniu.patientId, 'przynależność od celu scalenia').toBe(cel);
    expect((await A.vault.listPatientNotesForPatient(cel)).length, 'widać ją w karcie celu').toBe(1);
  });
});

describe('strażnik źródeł — interfejs (G7, G4, G27)', () => {
  it('edytor notatki znika przy zablokowaniu sejfu (nakładka nie przeżywa blokady)', () => {
    const s = zrodlo('vilda_auth_ui.js');
    expect(s).toContain('i.__vildaNoteEditorLockBound=!0,a.onLock(function(){');
    expect(s).toContain('querySelectorAll(".vilda-patient-note-editor-overlay")');
  });

  it('bramka przycisku gasi się po usunięciu wczytanego pacjenta', () => {
    const s = zrodlo('custom-fixes.js');
    expect(s).toContain('typeof n.onPatientDeleted=="function"&&n.onPatientDeleted(function(Qe)');
    expect(s).toContain('Qc===Qp&&I()');
  });

  it('skok z monitora GH ustawia pacjenta także w sessionStorage', () => {
    const s = zrodlo('gh_therapy_monitor.js');
    expect(s).toContain('window.sessionStorage.setItem("vildaCurrentPatientId",n.patientId)');
  });

  it('sejf: nagrobek notatki niesie rev w obu adapterach', () => {
    const s = zrodlo('vilda_vault.js');
    expect(s).toContain('typeof a.rev=="number"&&isFinite(a.rev)&&a.rev>0&&(c.rev=a.rev)');
    expect(s).toContain('typeof f.rev=="number"&&isFinite(f.rev)&&f.rev>0&&(E.rev=f.rev)');
  });
});
