/* BEGIN VILDA RAPID VISIT COMMIT V1 */
// A rapid intake creates its header and first snapshot in the same transaction.
// Ordinary saves continue through the existing per-patient save pipeline.
function RapidVisitCheck(change, patient, tombstone, clinicalHead) {
  change.assertCurrent();
  const expected = change.previous;
  const source = change.source;
  if (source && (!clinicalHead || clinicalHead.patientId !== change.patient.patientId ||
      clinicalHead.snapshotId !== source.snapshotId || (clinicalHead.rev || 0) !== source.revision ||
      (clinicalHead.updatedAtISO || clinicalHead.savedAtISO) !== source.updatedAtISO)) throw new Error('Dane ostatniej wizyty zmieniły się. Ponów zapis.');
  if (tombstone || (!!expected !== !!patient) || expected &&
      (expected.snapshotCount !== patient.snapshotCount || expected.lastSavedAtISO !== patient.lastSavedAtISO ||
       expected.headerCipher.iv !== patient.headerCipher.iv || expected.headerCipher.data !== patient.headerCipher.data)) {
    throw new Error('Kartoteka zmieniła się podczas zapisu. Wybierz ją ponownie.');
  }
}
async function RapidVisitDatabase(user, change, openDatabase) {
  PatientClinicalGuard(user);
  const db = await openDatabase(user);
  return new Promise((resolve, reject) => {
    const tx = PatientClinicalWriteValue(user, db).transaction([bt, It, xt], 'readwrite');
    const patients = tx.objectStore(bt), patient = patients.get(change.patient.patientId);
    const tombstone = tx.objectStore(xt).get(change.patient.patientId);
    const source = change.source && tx.objectStore(It).get(change.source.snapshotId);
    let pending = source ? 3 : 2, problem;
    tx.oncomplete = () => resolve(true);
    tx.onabort = () => reject(problem || tx.error || new Error('Nie udało się zapisać wizyty.'));
    const ready = () => {
      if (--pending) return;
      try {
        PatientClinicalGuard(user);
        RapidVisitCheck(change, patient.result, tombstone.result, source && source.result);
        tx.objectStore(It).add(change.snapshot);
        patients.put(change.patient);
      } catch (error) { problem = error; tx.abort(); }
    };
    patient.onsuccess = tombstone.onsuccess = ready;
    if (source) source.onsuccess = ready;
  });
}
function RapidVisitMemory(user, change, store, flush) {
  PatientClinicalGuard(user);
  const id = change.patient.patientId;
  RapidVisitCheck(change, store.patients.get(id), store.tombstones.get(id), change.source && store.snapshots.get(change.source.snapshotId));
  if (store.snapshots.has(change.snapshot.snapshotId)) throw new Error('Wersja wizyty już istnieje.');
  store.snapshots.set(change.snapshot.snapshotId, change.snapshot);
  store.patients.set(id, change.patient);
  flush();
  return true;
}
function RapidVisitBase(request, headerRows, newPatient, patientId, head, demographic) {
  request.assertCurrent();
  if (request.patientId ? newPatient || request.patientId !== patientId || !head ||
      head.snapshotId !== request.snapshotId || (head.rev || 0) !== request.revision : !newPatient) {
    throw new Error('Kartoteka zmieniła się podczas zapisu. Wybierz ją ponownie.');
  }
  if (!request.patientId && !request.explicitNew && headerRows.some(row => {
    const h = row.headerPlain;
    if (!h) throw new Error('Nie udało się odczytać pełnej listy pacjentów. Ponów zapis.');
    return !h.external && (h.firstName && h.lastName
      ? Ne(h.firstName) === Ne(demographic.firstName) && Ne(h.lastName) === Ne(demographic.lastName)
      : Ne(h.name) === Ne(demographic.name));
  })) throw new Error('Pojawiła się kartoteka o tym imieniu i nazwisku. Ponów zapis, aby ją wybrać.');
}
/* END VILDA RAPID VISIT COMMIT V1 */
