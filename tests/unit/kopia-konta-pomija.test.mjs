import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-KOPIA-POMIJA (decyzja właściciela 2026-10-08, przegląd „co dalej po #518”, punkt A5d): „Scal kopię konta” pomija
// pacjentów usuniętych tutaj albo scalonych tutaj z inną kartą i mówi o tym w podglądzie i w wyniku.
//
// Mierzone na `audyt` 8c13b80 (każdy przypadek oznaczony „przed zmianą” wtedy nie przechodził):
//   - pacjent usunięty po zrobieniu kopii: podgląd obiecywał „nowego pacjenta”, scalenie mówiło „dodano 1 pacjenta”,
//     a wewnętrzne scalanie od razu go usuwało; jego wersja z kosza przepadała (kosz 1 → 0);
//   - pacjent X scalony z Y po zrobieniu kopii: wersje X wracały spod Y do X i znikały razem z X — Y miała 3 wersje przy
//     liczniku 5; wpis kosza Y z wersją X znikał;
//   - notatka X tylko w kopii lądowała pod X z nagrobkiem (niewidoczna sierota).
//
// Prawdziwy vilda_vault.js, magazyn w pamięci, dane wyłącznie FIKCYJNE.

function magazyn() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
  };
}

let licznik = 0;
async function sejf() {
  licznik += 1;
  const win = {
    crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: magazyn(), sessionStorage: magazyn(),
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {}, removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
    AbortController,
  };
  win.window = win; win.self = win; win.top = win;
  win.localStorage.setItem('vildaRetention', '0'); // retencja wyłączona: testy liczą wersje same
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_vault.js', win);
  const v = win.VildaVault;
  const baza = v.createInMemoryAdapter();
  v.setStorageAdapter(baza);
  const haslo = `Kopia#Pomija!2026${licznik}aa`;
  await v.createUser(haslo, { label: `kopia-${licznik}`, iterations: 10000 });
  const [u] = await v.listUsers();
  return { v, baza, uid: u.userId, haslo };
}

const chwila = (ms) => new Promise((r) => { setTimeout(r, ms); });
const pomiar = (m) => ({ uid: `m-${m}`, ageMonths: m, ageYears: m / 12, height: 90 + m / 2, weight: 12 + m / 6 });
const zapis = (nazwisko, imie, wieki) => ({
  name: `${nazwisko} ${imie}`,
  user: { lastName: nazwisko, firstName: imie, sex: 'M', age: 5, ageMonths: 6, height: 110, weight: 19 },
  advanced: { data: { measurements: wieki.map(pomiar) } },
});

/* Karta z dwiema wersjami (60, potem 60+66) i opcjonalną notatką. */
async function karta(v, nazwisko, imie, notatka) {
  const a = await v.savePatient(zapis(nazwisko, imie, [60]), { dedup: false });
  await chwila(3);
  await v.savePatient(zapis(nazwisko, imie, [60, 66]), { patientId: a.patientId, dedup: false });
  if (notatka) await v.savePatientNote({ patientId: a.patientId, title: notatka, body: 'fikcja', category: 'wynik-badania' });
  return a.patientId;
}

/* Stan magazynu do porównań „przed i po”. */
async function stan(s) {
  const karty = await s.baza.listPatientsForUser(s.uid);
  const wynik = {};
  for (const k of karty) {
    const wersje = await s.baza.listSnapshotsForUser(s.uid, k.patientId);
    wynik[k.patientId] = { licznik: k.snapshotCount, wersje: wersje.map((w) => w.snapshotId).sort() };
  }
  return wynik;
}
const kosz = async (s) => (await s.v.listTrashedSnapshots()).map((e) => e.snapshotId).sort();
const nagrobki = async (s) => (await s.baza.listTombstonesForUser(s.uid)).map((t) => t.patientId).sort();

describe('P-KOPIA-POMIJA — pacjent usunięty tutaj po zrobieniu kopii', () => {
  it('podgląd i scalenie go pomijają i mówią o tym; magazyn i nagrobek bez zmian (przed zmianą: „dodano 1 pacjenta”)', async () => {
    const A = await sejf();
    const p1 = await karta(A.v, 'Testowy', 'Adam');
    const p2 = await karta(A.v, 'Fikcyjna', 'Ewa');
    const kopia = await A.v.exportVaultBackup();
    await chwila(5);
    await A.v.removePatient(p2);
    const przed = await stan(A);

    const podglad = await A.v.previewVaultBackupMerge(kopia, A.haslo);
    expect(podglad.addPatients, 'usunięty nie jest „nowym pacjentem”').toEqual([]);
    expect(podglad.totalNewSnapshots).toBe(0);
    expect(podglad.skippedPatients).toEqual([expect.objectContaining({
      patientId: p2, name: 'Fikcyjna Ewa', reason: 'deleted', mergedIntoPatientId: null, mergedIntoName: null,
      deletedAtISO: expect.any(String), snapshotCount: 2, missingSnapshotCount: 2,
    })]);
    expect(podglad.mergePatients.map((k) => k.patientId)).toEqual([p1]);

    const wynik = await A.v.mergeVaultBackup(kopia, A.haslo);
    expect(wynik).toMatchObject({ addedPatientCount: 0, addedSnapshotCount: 0, skippedDeletedPatientCount: 1, skippedMergedPatientCount: 0 });
    expect(wynik.skippedPatients).toEqual([expect.objectContaining({ patientId: p2, reason: 'deleted' })]);
    expect(await stan(A), 'magazyn bez zmian').toEqual(przed);
    expect(await nagrobki(A), 'nagrobek zostaje').toEqual([p2]);
    expect(await A.v.listPatientNotesForPatient(p2)).toEqual([]);

    const ponownie = await A.v.previewVaultBackupMerge(kopia, A.haslo);
    expect(ponownie.skippedPatients.map((k) => k.patientId), 'ponowny podgląd mówi to samo').toEqual([p2]);
    expect(ponownie.addPatients).toEqual([]);
  });

  it('jego wersja w koszu zostaje w koszu (przed zmianą: kosz 1 → 0, wersja przepadała)', async () => {
    const A = await sejf();
    await karta(A.v, 'Testowy', 'Adam');
    const p2 = await karta(A.v, 'Fikcyjna', 'Ewa');
    const kopia = await A.v.exportVaultBackup();
    const [wersja] = await A.baza.listSnapshotsForUser(A.uid, p2);
    await A.v.moveSnapshotToTrash(p2, wersja.snapshotId);
    await chwila(5);
    await A.v.removePatient(p2);
    const wKoszu = await kosz(A);
    expect(wKoszu).toEqual([wersja.snapshotId]);

    const podglad = await A.v.previewVaultBackupMerge(kopia, A.haslo);
    expect(podglad.skippedPatients[0].missingSnapshotCount, 'wpis kosza usuniętej karty nie jest „tutaj” (nie da się go przywrócić)').toBe(2);
    const wynik = await A.v.mergeVaultBackup(kopia, A.haslo);
    expect(wynik.skippedPatients.map((k) => [k.patientId, k.reason])).toEqual([[p2, 'deleted']]);
    expect(wynik.addedPatientCount).toBe(0);
    expect(await kosz(A), 'kosz bez zmian').toEqual(wKoszu);
    expect(await A.baza.getPatientForUser(A.uid, p2)).toBeFalsy();
  });

  it('usunięcie w innej karcie w trakcie scalania: decyzja na świeżym nagrobku pod blokadą, nie na mapie ze startu', async () => {
    const A = await sejf();
    const p = await karta(A.v, 'Testowy', 'Adam');
    const x = await karta(A.v, 'Fikcyjny', 'Xawery');
    const kopia = await A.v.exportVaultBackup();
    expect((await A.baza.listPatientsForUser(A.uid)).map((k) => k.patientId)[0], 'warunek: Adam przed Xawerym').toBe(p);
    const [w] = await A.baza.listSnapshotsForUser(A.uid, p);
    await A.v.moveSnapshotToTrash(p, w.snapshotId); // Adam dostanie wersję z kopii — mapa powstaje przy Adamie
    await chwila(5);
    const zapiszWersje = A.baza.putSnapshotForUser.bind(A.baza);
    let raz = false;
    A.baza.putSnapshotForUser = async (uid, rekord) => {
      const r = await zapiszWersje(uid, rekord);
      if (!raz && rekord.patientId === p) { raz = true; await A.v.removePatient(x); } // „inna karta przeglądarki”
      return r;
    };
    const wynik = await A.v.mergeVaultBackup(kopia, A.haslo);
    expect(raz).toBe(true);
    expect(wynik.addedPatientCount).toBe(0);
    expect(wynik.skippedPatients.map((k) => [k.patientId, k.reason])).toEqual([[x, 'deleted']]);
    expect(await A.baza.getPatientForUser(A.uid, x)).toBeFalsy();
    expect(await nagrobki(A)).toEqual([x]);
  });

  it('kontrola: kopia nowsza niż usunięcie przywraca kartę jak dotąd (reguła nagrobka synchronizacji)', async () => {
    const A = await sejf();
    const B = await sejf();
    const x = await karta(A.v, 'Testowy', 'Jan');
    await B.v.mergeSyncPayload(await A.v.exportSyncPayload());
    await chwila(5);
    await A.v.removePatient(x);
    await chwila(5);
    await B.v.savePatient(zapis('Testowy', 'Jan', [60, 66, 72]), { patientId: x, dedup: false });
    const kopiaB = await B.v.exportVaultBackup();

    const podglad = await A.v.previewVaultBackupMerge(kopiaB, B.haslo);
    expect(podglad.skippedPatients).toEqual([]);
    expect(podglad.addPatients.map((k) => [k.patientId, k.snapshotCount])).toEqual([[x, 3]]);
    const wynik = await A.v.mergeVaultBackup(kopiaB, B.haslo);
    expect(wynik).toMatchObject({ addedPatientCount: 1, addedSnapshotCount: 3, skippedPatients: [] });
    expect((await A.baza.listSnapshotsForUser(A.uid, x)).length).toBe(3);
  });
});

describe('P-KOPIA-POMIJA — pacjent scalony tutaj z inną kartą po zrobieniu kopii', () => {
  it('podgląd i scalenie wskazują kartę docelową; Y zachowuje wszystkie wersje (przed zmianą: Y 3 wersje przy liczniku 5)', async () => {
    const A = await sejf();
    const y = await karta(A.v, 'Testowy', 'Jan', 'N-Y');
    const x = await karta(A.v, 'Testowy', 'Jan', 'N-X');
    const kopia = await A.v.exportVaultBackup();
    await chwila(5);
    await A.v.mergePatients(x, y);
    const przed = await stan(A);
    expect(przed[y], '2 wersje Y + 2 wersje X + wersja scalenia').toMatchObject({ licznik: 5 });
    expect(przed[y].wersje).toHaveLength(5);

    const podglad = await A.v.previewVaultBackupMerge(kopia, A.haslo);
    expect(podglad.addPatients).toEqual([]);
    expect(podglad.totalNewSnapshots).toBe(0);
    expect(podglad.skippedPatients).toEqual([expect.objectContaining({
      patientId: x, reason: 'merged', mergedIntoPatientId: y, mergedIntoName: 'Testowy Jan',
      snapshotCount: 2, missingSnapshotCount: 0, missingNoteCount: 0,
    })]);
    expect(podglad.mergePatients).toEqual([expect.objectContaining({ patientId: y, newSnapshotCount: 0 })]);

    const wynik = await A.v.mergeVaultBackup(kopia, A.haslo);
    expect(wynik).toMatchObject({ addedPatientCount: 0, addedSnapshotCount: 0, skippedMergedPatientCount: 1, skippedDeletedPatientCount: 0 });
    expect(wynik.skippedPatients).toEqual([expect.objectContaining({ patientId: x, reason: 'merged', mergedIntoPatientId: y })]);
    expect(await stan(A), 'Y ma te same wersje i licznik, X nie wraca').toEqual(przed);
    expect((await A.v.listPatientNotesForPatient(y)).map((n) => n.title).sort()).toEqual(['N-X', 'N-Y']);
    expect(await A.v.listPatientNotesForPatient(x)).toEqual([]);
  });

  it('wersja X leżąca w koszu Y zostaje w koszu (przed zmianą: Y 4 → 3 wersje przy liczniku 4, kosz 1 → 0)', async () => {
    const A = await sejf();
    const y = await karta(A.v, 'Testowy', 'Jan');
    const x = await karta(A.v, 'Testowy', 'Jan');
    const kopia = await A.v.exportVaultBackup();
    const [wersjaX] = await A.baza.listSnapshotsForUser(A.uid, x);
    await chwila(5);
    await A.v.mergePatients(x, y);
    await A.v.moveSnapshotToTrash(y, wersjaX.snapshotId);
    const przed = await stan(A);
    const wKoszu = await kosz(A);
    expect(wKoszu).toEqual([wersjaX.snapshotId]);

    const podglad = await A.v.previewVaultBackupMerge(kopia, A.haslo);
    expect(podglad.skippedPatients.map((k) => [k.patientId, k.reason, k.mergedIntoPatientId])).toEqual([[x, 'merged', y]]);
    const wynik = await A.v.mergeVaultBackup(kopia, A.haslo);
    expect(wynik.skippedMergedPatientCount).toBe(1);
    expect(await stan(A)).toEqual(przed);
    expect(await kosz(A), 'kosz Y bez zmian').toEqual(wKoszu);
  });

  it('rozpoznanie bez nagrobka X (przycinany po 365 dniach): nadal „scalony”, bez daty usunięcia', async () => {
    const A = await sejf();
    const y = await karta(A.v, 'Testowy', 'Jan');
    const x = await karta(A.v, 'Testowy', 'Jan');
    const kopia = await A.v.exportVaultBackup();
    await chwila(5);
    await A.v.mergePatients(x, y);
    await A.baza.removeTombstoneForUser(A.uid, x);
    const przed = await stan(A);

    const podglad = await A.v.previewVaultBackupMerge(kopia, A.haslo);
    expect(podglad.skippedPatients).toEqual([expect.objectContaining({ patientId: x, reason: 'merged', mergedIntoPatientId: y, deletedAtISO: null })]);
    const wynik = await A.v.mergeVaultBackup(kopia, A.haslo);
    expect(wynik.skippedMergedPatientCount).toBe(1);
    expect(await stan(A)).toEqual(przed);
  });

  it('rozpoznanie po notatkach, gdy wersji X nie ma już tu nigdzie (przycięte po scaleniu): „scalony” z Y, nie „usunięty”', async () => {
    const A = await sejf();
    const y = await karta(A.v, 'Testowy', 'Jan');
    const x = await karta(A.v, 'Testowy', 'Jan', 'N-X');
    const kopia = await A.v.exportVaultBackup();
    const wersjeX = (await A.baza.listSnapshotsForUser(A.uid, x)).map((w) => w.snapshotId);
    await chwila(5);
    await A.v.mergePatients(x, y);
    for (const id of wersjeX) await A.baza.removeSnapshotForUser(A.uid, id);

    const podglad = await A.v.previewVaultBackupMerge(kopia, A.haslo);
    expect(podglad.skippedPatients).toEqual([expect.objectContaining({
      patientId: x, reason: 'merged', mergedIntoPatientId: y, missingSnapshotCount: 2, missingNoteCount: 0,
    })]);
    const wynik = await A.v.mergeVaultBackup(kopia, A.haslo);
    expect(wynik.skippedPatients.map((k) => [k.patientId, k.reason, k.mergedIntoPatientId])).toEqual([[x, 'merged', y]]);
    expect(await A.baza.getPatientForUser(A.uid, x)).toBeFalsy();
  });

  it('nowsza poprawka notatki X z kopii trafia do jej karty docelowej Y (jak dotąd), X nie wraca', async () => {
    const A = await sejf();
    const B = await sejf();
    const y = await karta(A.v, 'Testowy', 'Jan');
    const x = await karta(A.v, 'Testowy', 'Jan', 'N-X');
    await B.v.mergeSyncPayload(await A.v.exportSyncPayload());
    await chwila(5);
    await A.v.mergePatients(x, y);
    await chwila(5);
    const [notatka] = await B.v.listPatientNotesForPatient(x);
    await B.v.savePatientNote({ ...notatka, body: 'POPRAWIONY wynik (fikcja)' });
    const kopiaB = await B.v.exportVaultBackup();

    const wynik = await A.v.mergeVaultBackup(kopiaB, B.haslo);
    expect(wynik.skippedPatients.map((k) => [k.patientId, k.reason, k.mergedIntoPatientId])).toEqual([[x, 'merged', y]]);
    expect(wynik.updatedPatientNoteCount).toBe(1);
    expect((await A.v.listPatientNotesForPatient(y)).map((n) => [n.title, n.body])).toEqual([['N-X', 'POPRAWIONY wynik (fikcja)']]);
    expect(await A.baza.getPatientForUser(A.uid, x)).toBeFalsy();
  });

  it('kopia z nowszą wersją X niż scalenie tutaj: X pominięty w całości, podgląd liczy tę wersję', async () => {
    const A = await sejf();
    const B = await sejf();
    const y = await karta(A.v, 'Testowy', 'Jan');
    const x = await karta(A.v, 'Testowy', 'Jan');
    await B.v.mergeSyncPayload(await A.v.exportSyncPayload());
    await chwila(5);
    await A.v.mergePatients(x, y);
    await chwila(5);
    await B.v.savePatient(zapis('Testowy', 'Jan', [60, 66, 72]), { patientId: x, dedup: false });
    const kopiaB = await B.v.exportVaultBackup();
    const przed = await stan(A);

    const podglad = await A.v.previewVaultBackupMerge(kopiaB, B.haslo);
    expect(podglad.skippedPatients).toEqual([expect.objectContaining({ patientId: x, reason: 'merged', mergedIntoPatientId: y, snapshotCount: 3, missingSnapshotCount: 1 })]);
    // Nagrobek X przycięty (365 dni): scalenie tutaj poznajemy po tym, że karta docelowa Y jest też w kopii.
    await A.baza.removeTombstoneForUser(A.uid, x);
    await A.v.mergeVaultBackup(kopiaB, B.haslo);
    expect(await stan(A)).toEqual(przed);
  });

  it('wszystkie wersje X leżą tu pod Y, której nie ma w kopii, a nagrobek X przycięty: nadal „scalony” (bez pustej karty X)', async () => {
    const A = await sejf();
    const x = await karta(A.v, 'Testowy', 'Jan');
    const kopia = await A.v.exportVaultBackup();
    const y = await karta(A.v, 'Testowy', 'Jan');
    await chwila(5);
    await A.v.mergePatients(x, y);
    await A.baza.removeTombstoneForUser(A.uid, x);
    const przed = await stan(A);

    const wynik = await A.v.mergeVaultBackup(kopia, A.haslo);
    expect(wynik.skippedPatients.map((k) => [k.patientId, k.reason, k.mergedIntoPatientId])).toEqual([[x, 'merged', y]]);
    expect(wynik.addedPatientCount).toBe(0);
    expect(await stan(A)).toEqual(przed);
  });

  it('scalenie w odwrotną stronę na innym urządzeniu (Y scalony z nowym X): X wchodzi ze swoimi wersjami, Y zachowuje swoje', async () => {
    const A = await sejf();
    const B = await sejf();
    const y = await karta(A.v, 'Testowy', 'Jan', 'N-Y');
    await B.v.mergeSyncPayload(await A.v.exportSyncPayload());
    const x = await karta(B.v, 'Testowy', 'Jan', 'N-X');
    await chwila(5);
    await B.v.mergePatients(y, x);
    const kopiaB = await B.v.exportVaultBackup();
    const wersjeY = (await A.baza.listSnapshotsForUser(A.uid, y)).map((w) => w.snapshotId).sort();
    const wersjeXwKopii = (await B.baza.listSnapshotsForUser(B.uid, x)).length;

    const podglad = await A.v.previewVaultBackupMerge(kopiaB, B.haslo);
    expect(podglad.skippedPatients).toEqual([]);
    expect(podglad.foreignSnapshotCount).toBe(2);
    expect(podglad.addPatients.map((k) => [k.patientId, k.snapshotCount])).toEqual([[x, wersjeXwKopii - 2]]);
    const wynik = await A.v.mergeVaultBackup(kopiaB, B.haslo);
    expect(wynik).toMatchObject({ addedPatientCount: 1, addedSnapshotCount: wersjeXwKopii - 2, foreignSnapshotCount: 2, skippedPatients: [] });
    expect((await A.baza.listSnapshotsForUser(A.uid, y)).map((w) => w.snapshotId).sort(), 'Y zachowuje swoje wersje').toEqual(wersjeY);
    expect((await A.baza.listSnapshotsForUser(A.uid, x)).length).toBe(wersjeXwKopii - 2);
  });

  it('notatka X, której tu nie ma, nie jest importowana; podgląd ją liczy (przed zmianą: sierota pod X z nagrobkiem)', async () => {
    const A = await sejf();
    const y = await karta(A.v, 'Testowy', 'Jan');
    const x = await karta(A.v, 'Testowy', 'Jan', 'N-X tylko w kopii');
    const kopia = await A.v.exportVaultBackup();
    const C = await sejf();
    const ladunek = await A.v.exportSyncPayload();
    await C.v.mergeSyncPayload({ ...ladunek, patientNotes: [] });
    await chwila(5);
    await C.v.mergePatients(x, y);

    const podglad = await C.v.previewVaultBackupMerge(kopia, A.haslo);
    expect(podglad.skippedPatients).toEqual([expect.objectContaining({ patientId: x, reason: 'merged', mergedIntoPatientId: y, missingNoteCount: 1 })]);
    const wynik = await C.v.mergeVaultBackup(kopia, A.haslo);
    expect(wynik.addedPatientNoteCount).toBe(0);
    expect((await C.v.listAllPatientNotes()).map((n) => n.title), 'brak sieroty').not.toContain('N-X tylko w kopii');
    expect(await C.baza.listPatientNotesForUser(C.uid)).toEqual([]);
  });
});

describe('P-KOPIA-POMIJA — strażnik wersji innej karty i kontrole', () => {
  it('wersja z kopii, która należy tu do innej karty, nie jest zabierana tej karcie', async () => {
    const A = await sejf();
    const z = await karta(A.v, 'Testowy', 'Adam');
    const y = await karta(A.v, 'Fikcyjna', 'Ewa');
    const kopia = await A.v.exportVaultBackup();
    // Wersja Z leży teraz pod Y (sztucznie, przez magazyn) — jak po przepięciu wersji przez scalenie.
    const [s] = await A.baza.listSnapshotsForUser(A.uid, z);
    await A.baza.putSnapshotForUser(A.uid, { ...s, patientId: y });
    const przed = await stan(A);
    expect(przed[y].wersje).toContain(s.snapshotId);

    const podglad = await A.v.previewVaultBackupMerge(kopia, A.haslo);
    expect(podglad.mergePatients.find((k) => k.patientId === z).newSnapshotCount, 'wersja Y nie jest „nowa” dla Z').toBe(0);
    expect(podglad.foreignSnapshotCount).toBe(1);
    expect(podglad.totalNewSnapshots).toBe(0);
    const wynik = await A.v.mergeVaultBackup(kopia, A.haslo);
    expect(wynik).toMatchObject({ addedSnapshotCount: 0, foreignSnapshotCount: 1, skippedPatients: [] });
    expect(await stan(A), 'Y zachowuje wersję, Z bez zmian').toEqual(przed);
  });

  it('wersja z kopii leżąca tu w koszu innej karty: nie wraca pod tę kartę i nie znika z kosza', async () => {
    const A = await sejf();
    const z = await karta(A.v, 'Testowy', 'Adam');
    const y = await karta(A.v, 'Fikcyjna', 'Ewa');
    const kopia = await A.v.exportVaultBackup();
    const [s] = await A.baza.listSnapshotsForUser(A.uid, z);
    await A.baza.putSnapshotForUser(A.uid, { ...s, patientId: y });
    await A.v.moveSnapshotToTrash(y, s.snapshotId);
    const przed = await stan(A);
    const wKoszu = await kosz(A);
    expect(wKoszu).toEqual([s.snapshotId]);

    const podglad = await A.v.previewVaultBackupMerge(kopia, A.haslo);
    expect(podglad.foreignSnapshotCount).toBe(1);
    expect(podglad.totalNewSnapshots).toBe(0);
    const wynik = await A.v.mergeVaultBackup(kopia, A.haslo);
    expect(wynik).toMatchObject({ addedSnapshotCount: 0, foreignSnapshotCount: 1 });
    expect(await stan(A)).toEqual(przed);
    expect(await kosz(A), 'wpis kosza Y zostaje').toEqual(wKoszu);
  });

  it('kontrola: nowi pacjenci i nowe wersje istniejących kart dochodzą jak dotąd', async () => {
    const A = await sejf();
    const p1 = await karta(A.v, 'Testowy', 'Adam', 'N-P1');
    const C = await sejf();
    await C.v.mergeSyncPayload(await A.v.exportSyncPayload());
    await chwila(5);
    await A.v.savePatient(zapis('Testowy', 'Adam', [60, 66, 72]), { patientId: p1, dedup: false });
    const p3 = await karta(A.v, 'Nowa', 'Ola', 'N-P3');
    const kopia = await A.v.exportVaultBackup();

    const podglad = await C.v.previewVaultBackupMerge(kopia, A.haslo);
    expect(podglad).toMatchObject({ skippedPatients: [], foreignSnapshotCount: 0, totalNewSnapshots: 3 });
    expect(podglad.addPatients.map((k) => [k.patientId, k.snapshotCount])).toEqual([[p3, 2]]);
    const wynik = await C.v.mergeVaultBackup(kopia, A.haslo);
    expect(wynik).toMatchObject({ addedPatientCount: 1, addedSnapshotCount: 3, skippedPatients: [], foreignSnapshotCount: 0 });
    expect((await C.baza.listSnapshotsForUser(C.uid, p1)).length).toBe(3);
    expect((await C.v.listPatientNotesForPatient(p3)).map((n) => n.title)).toEqual(['N-P3']);
  });

  it('pusty sejf: cała kopia wchodzi, nic nie jest pomijane', async () => {
    const A = await sejf();
    await karta(A.v, 'Testowy', 'Adam');
    await karta(A.v, 'Fikcyjna', 'Ewa');
    const kopia = await A.v.exportVaultBackup();
    const C = await sejf();
    const wynik = await C.v.mergeVaultBackup(kopia, A.haslo);
    expect(wynik).toMatchObject({ addedPatientCount: 2, addedSnapshotCount: 4, skippedPatients: [], foreignSnapshotCount: 0 });
  });
});
