import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Dwa dokumenty tej samej karty: osobne wskaźniki, wspólna rzeczywista
// referencja sessionStorage i migawka sesji. Wszystkie dane są fikcyjne.
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const PID = 'fictional-shared-chip';
const payload = () => ({ name: 'Fikcyjny Wspólny', user: { age: 12, height: 150, weight: 41, sex: 'M' } });

function tab() {
  return { storage: new Map([['vildaCurrentPatientId', PID]]), session: payload() };
}

function frame(shared, { emptyAtBoot = false, passive = false } = {}) {
  const listeners = {};
  const windowListeners = {};
  const savedListeners = [];
  let form = emptyAtBoot ? null : clone(shared.session);
  let readingSession = !emptyAtBoot;
  const persist = vi.fn(() => { shared.session = clone(form); return true; });
  const win = {
    setTimeout, clearTimeout, setInterval, clearInterval,
    console: { debug() {} },
    addEventListener(type, callback) { (windowListeners[type] ||= []).push(callback); },
    document: {
      readyState: 'complete', getElementById: () => null,
      addEventListener(type, callback) { (listeners[type] ||= []).push(callback); },
    },
    sessionStorage: {
      getItem: key => shared.storage.get(key) ?? null,
      setItem: (key, value) => shared.storage.set(key, String(value)),
      removeItem: key => shared.storage.delete(key),
    },
    VildaVault: { isUnlocked: () => true, onPatientSaved(callback) { savedListeners.push(callback); } },
    VildaDataImportExport: { getApplyLoadedDataSequence: () => 1 },
    VildaPersistence: { readMainSession: () => readingSession ? clone(shared.session) : null },
    collectUserData: () => clone(form),
    hasMeaningfulMainSessionData: value => Boolean(value?.name),
    saveMainSessionNow: persist,
  };
  if (passive) {
    win.__vildaSaveStatusReadOnly = true;
    delete win.collectUserData;
    delete win.hasMeaningfulMainSessionData;
    delete win.saveMainSessionNow;
    delete win.VildaDataImportExport;
  }
  loadBrowserScript('vilda_save_status_indicator.js', win);
  const indicator = win.VildaSaveStatusIndicator;
  const emit = (type, detail, isTrusted) => {
    for (const callback of listeners[type] || []) callback({ type, detail, isTrusted });
  };
  return {
    win, indicator, persist, emit,
    emitWindow(type, properties = {}) { (windowListeners[type] || []).forEach(callback => callback({ type, ...properties })); },
    notifySaved(info) { savedListeners.forEach(callback => callback(info)); },
    restore() { readingSession = true; form = clone(shared.session); emit('vilda:persist-restored'); vi.advanceTimersByTime(200); },
    saved(snapshotCount = 1) {
      emit('vilda:patient-loaded', { patientId: PID, applySequence: 1,
        name: shared.session.name, savedAtISO: '2026-10-29T10:00:00.000Z', snapshotCount });
      vi.advanceTimersByTime(150);
    },
    editWeight(value, { persisted = true } = {}) {
      form.user.weight = value;
      if (persisted) shared.session = clone(form);
    },
    compare() { indicator.notifyExternalChange(); vi.advanceTimersByTime(400); },
  };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-29T12:00:00Z')); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('P-CHIP-POWŁOKA — referencja współdzielona między dokumentami', () => {
  it.each([false, true])('późne odtworzenie pustej ramki zachowuje referencję (dirty=%s)', dirty => {
    const shared = tab();
    const first = frame(shared);
    first.saved();
    if (dirty) { first.editWeight(42); first.compare(); }
    const before = shared.storage.get('vilda-save-ref-v1');
    const late = frame(shared, { emptyAtBoot: true });
    expect(late.indicator.getState()).toBe('hidden');
    late.restore();
    expect(shared.storage.get('vilda-save-ref-v1')).toBe(before);
    expect(late.indicator.getReferenceFingerprint()).toBe(first.indicator.getReferenceFingerprint());
    expect(late.indicator.getState()).toBe(dirty ? 'dirty' : 'saved');
    expect(late.indicator.getLastSnapshotCount()).toBe(1);
  });

  it('zapis tego samego pacjenta w rodzeństwie odświeża bazę i metadane bez nadpisania formularza', () => {
    const shared = tab();
    const first = frame(shared);
    first.saved();
    const sibling = frame(shared);
    sibling.restore();
    first.editWeight(42);
    first.saved(2);
    const reference = shared.storage.get('vilda-save-ref-v1');
    sibling.restore();
    expect(sibling.indicator.getState()).toBe('saved');
    expect(sibling.indicator.getReferenceFingerprint()).toBe(first.indicator.getReferenceFingerprint());
    expect(sibling.indicator.getLastSnapshotCount()).toBe(2);
    expect(shared.storage.get('vilda-save-ref-v1')).toBe(reference);
    expect(sibling.persist).not.toHaveBeenCalled();
    sibling.editWeight(43);
    sibling.compare();
    expect(sibling.indicator.getState()).toBe('dirty');
    expect(sibling.indicator.getReferenceFingerprint()).toBe(first.indicator.getReferenceFingerprint());
  });

  it('jawne uzgodnienie czyta wspólną sesję, nie zapisuje starszego formularza ukrytej ramki', () => {
    const shared = tab();
    const first = frame(shared);
    first.saved();
    const hidden = frame(shared);
    first.editWeight(42);
    first.compare();
    const before = clone(shared.session);
    const reference = shared.storage.get('vilda-save-ref-v1');
    hidden.indicator.reconcileFromSharedReference();
    expect(hidden.indicator.getState()).toBe('dirty');
    expect(shared.session).toEqual(before);
    expect(shared.storage.get('vilda-save-ref-v1')).toBe(reference);
    expect(hidden.persist).not.toHaveBeenCalled();
  });

  it('referencja innego pacjenta nie jest przejmowana jako zapis bieżącego formularza', () => {
    const shared = tab();
    const first = frame(shared);
    first.saved();
    const reference = JSON.parse(shared.storage.get('vilda-save-ref-v1'));
    reference.patientId = 'fictional-other-patient';
    shared.storage.set('vilda-save-ref-v1', JSON.stringify(reference));
    first.indicator.reconcileFromSharedReference();
    expect(first.indicator.getState()).toBe('new_patient');
    expect(first.indicator.getReferenceFingerprint()).toBeNull();
    expect(JSON.parse(shared.storage.get('vilda-save-ref-v1')).patientId).toBe('fictional-other-patient');
  });

  it('referencja statusu nie powiela trwałego identyfikatora pacjenta', () => {
    const shared = tab();
    const first = frame(shared);
    first.saved();
    const reference = shared.storage.get('vilda-save-ref-v1');
    expect(JSON.parse(reference)).not.toHaveProperty('patientId');
    expect(reference).not.toContain(PID);
    first.editWeight(42);
    first.compare();
    expect(shared.storage.get('vilda-save-ref-v1')).not.toContain(PID);
  });

  it('spóźniona publikacja pacjenta A nie zastępuje referencji już wczytanego pacjenta B', () => {
    const shared = tab();
    const first = frame(shared);
    first.saved();
    first.emit('vilda:patient-loaded', { patientId: PID, applySequence: 1, name: shared.session.name });
    shared.storage.set('vildaCurrentPatientId', 'fictional-patient-b');
    shared.session = { name: 'Fikcyjny Drugi', user: { age: 9, height: 134, weight: 30, sex: 'F' } };
    first.win.VildaPanelPacjent = { nieaktualny: () => true };
    const second = frame(shared);
    second.emit('vilda:patient-loaded', { patientId: 'fictional-patient-b', applySequence: 1, name: shared.session.name });
    vi.advanceTimersByTime(150);
    const referenceB = shared.storage.get('vilda-save-ref-v1');
    expect(second.indicator.getState()).toBe('saved');
    expect(JSON.parse(referenceB).patientName).toBe('Fikcyjny Drugi');
    first.indicator.reconcileFromSharedReference();
    expect(first.indicator.isReadyForSharedReference()).toBe(false);
    expect(shared.storage.get('vilda-save-ref-v1')).toBe(referenceB);
    expect(first.indicator.getReferenceFingerprint()).not.toBe(second.indicator.getReferenceFingerprint());
  });

  it('szybkie A→B→A przed uzgodnieniem nie wskrzesza odroczonej edycji pacjenta A', () => {
    const shared = tab();
    const first = frame(shared);
    first.saved();
    first.persist.mockClear();
    first.win.__vildaPersistPauseUntil = Date.now() + 900;
    first.editWeight(42, { persisted: false });
    first.emit('input', undefined, true);
    shared.storage.set('vildaCurrentPatientId', 'fictional-patient-b');
    first.emit('vilda:persist-restored');
    shared.storage.set('vildaCurrentPatientId', PID);
    first.emit('vilda:persist-restored');
    vi.advanceTimersByTime(900);
    expect(first.persist).not.toHaveBeenCalled();
    expect(shared.session.user.weight).toBe(41);
    expect(first.indicator.getState()).toBe('saved');
  });

  it.each(['restore', 'queued-storage'])('A→B→A anuluje także oczekującą publikację G przez %s', signal => {
    const shared = tab();
    const first = frame(shared);
    first.saved();
    first.editWeight(42);
    first.persist.mockClear();
    const reference = shared.storage.get('vilda-save-ref-v1');
    first.emit('vilda:patient-loaded', { patientId: PID, applySequence: 1, name: shared.session.name, snapshotCount: 2 });
    if (signal === 'restore') {
      shared.storage.set('vildaCurrentPatientId', 'fictional-patient-b');
      first.emit('vilda:persist-restored');
      shared.storage.set('vildaCurrentPatientId', PID);
      first.emit('vilda:persist-restored');
    } else {
      // Karta zdążyła wrócić do A, zanim przeglądarka doręczyła oba zdarzenia.
      first.emitWindow('storage', { key: 'vildaCurrentPatientId', newValue: 'fictional-patient-b' });
      first.emitWindow('storage', { key: 'vildaCurrentPatientId', newValue: PID });
    }
    vi.advanceTimersByTime(150);
    expect(shared.storage.get('vilda-save-ref-v1')).toBe(reference);
    expect(first.persist).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(first.indicator.getState()).toBe('dirty');
    expect(first.indicator.getLastSnapshotCount()).toBe(1);
  });

  it('G przed nadaniem ID akceptuje własne przejście od początkowego do docelowego właściciela', () => {
    const shared = tab();
    shared.storage.delete('vildaCurrentPatientId');
    const first = frame(shared);
    first.emit('vilda:patient-loaded', { patientId: PID, applySequence: 1, name: shared.session.name, snapshotCount: 1 });
    first.emit('vilda:persist-restored'); // Początkowy null jest jeszcze poprawny.
    shared.storage.set('vildaCurrentPatientId', PID);
    first.emit('vilda:persist-restored'); // Setter własnego loadera został wykonany.
    vi.advanceTimersByTime(150);
    expect(first.indicator.getState()).toBe('saved');
    expect(first.indicator.getReferenceFingerprint()).toBe(first.indicator._computeCanonicalFingerprint());
    expect(first.indicator.getLastSnapshotCount()).toBe(1);
  });

  it.each(['saving', 'error'])('uzgodnienie przy nawigacji zachowuje rzeczywisty stan %s', state => {
    const shared = tab();
    const first = frame(shared);
    first.saved();
    if (state === 'saving') {
      first.editWeight(42);
      first.compare();
      first.indicator._onSaveClicked();
    } else first.indicator.notifySaveFailed('Fikcyjny błąd zapisu');
    expect(first.indicator.reconcileFromSharedReference()).toBe(state);
    expect(first.indicator.getState()).toBe(state);
  });

  it('odtworzenie w trakcie debouncingu nie kasuje kolejki rzeczywistej edycji', () => {
    const shared = tab();
    const first = frame(shared);
    first.saved();
    first.persist.mockClear();
    first.editWeight(42, { persisted: false });
    first.emit('input', undefined, true);
    first.emit('vilda:persist-restored');
    vi.advanceTimersByTime(200);
    expect(shared.session.user.weight).toBe(41);
    expect(first.indicator.getState()).toBe('saved');
    vi.advanceTimersByTime(200);
    expect(first.indicator.getState()).toBe('dirty');
    expect(shared.session.user.weight).toBe(42);
    expect(first.persist).toHaveBeenCalled();
  });

  it('gotowość czeka na pełne odtworzenie sesji i odblokowane konto', () => {
    const shared = tab();
    const first = frame(shared);
    first.saved();
    let pending = true;
    first.win.VildaDataImportExport.isMainSessionRestorePending = () => pending;
    expect(first.indicator.isReadyForSharedReference()).toBe(false);
    first.editWeight(42);
    expect(first.indicator.reconcileFromSharedReference()).toBe('saved');
    pending = false;
    expect(first.indicator.isReadyForSharedReference()).toBe(true);
    expect(first.indicator.reconcileFromSharedReference()).toBe('dirty');
    first.win.VildaVault.isUnlocked = () => false;
    expect(first.indicator.isReadyForSharedReference()).toBe(false);
  });

  it('nie odtwarza poprzedniej bazy pomiędzy powiadomieniem wczytania i publikacją nowej', () => {
    const shared = tab();
    const first = frame(shared);
    first.saved();
    first.editWeight(42);
    first.emit('vilda:patient-loaded', { patientId: PID, applySequence: 1, name: shared.session.name, snapshotCount: 2 });
    expect(first.indicator.isReadyForSharedReference()).toBe(false);
    first.indicator.reconcileFromSharedReference();
    vi.advanceTimersByTime(150);
    expect(first.indicator.isReadyForSharedReference()).toBe(true);
    expect(first.indicator.getState()).toBe('saved');
    expect(first.indicator.getLastSnapshotCount()).toBe(2);
  });

  it('zapis karty innego pacjenta nie zatwierdza niezapisanych danych wczytanego pacjenta', () => {
    const shared = tab();
    const first = frame(shared);
    first.saved();
    first.editWeight(42);
    first.compare();
    const reference = shared.storage.get('vilda-save-ref-v1');
    first.persist.mockClear();
    first.notifySaved({ patientId: 'fictional-other-patient', header: { name: 'Fikcyjny Inny' },
      savedAtISO: '2026-10-29T12:00:00.000Z', snapshotCount: 7 });
    expect(first.indicator.getState()).toBe('dirty');
    expect(shared.storage.get('vilda-save-ref-v1')).toBe(reference);
    expect(first.indicator.getLastPatientName()).toBe('Fikcyjny Wspólny');
    expect(first.indicator.getLastSnapshotCount()).toBe(1);
    expect(first.indicator.getLastSavedAtISO()).toBe('2026-10-29T10:00:00.000Z');
    expect(first.persist).not.toHaveBeenCalled();
  });

  it('zapis bieżącego pacjenta ustanawia nową bazę i aktualizuje metadane', () => {
    const shared = tab();
    const first = frame(shared);
    first.saved();
    first.editWeight(42);
    first.compare();
    first.notifySaved({ patientId: PID, header: { name: shared.session.name },
      savedAtISO: '2026-10-29T12:00:00.000Z', snapshotCount: 2 });
    expect(first.indicator.getState()).toBe('saved');
    expect(first.indicator.getReferenceFingerprint()).toBe(first.indicator._computeCanonicalFingerprint());
    expect(first.indicator.getLastSnapshotCount()).toBe(2);
    expect(first.indicator.getLastSavedAtISO()).toBe('2026-10-29T12:00:00.000Z');
  });

  it('nieaktualna ramka nie zastępuje wspólnej bazy po lokalnym powiadomieniu sejfu', () => {
    const shared = tab();
    const first = frame(shared);
    first.saved();
    first.editWeight(42);
    first.compare();
    first.win.VildaPanelPacjent = { nieaktualny: () => true };
    const reference = shared.storage.get('vilda-save-ref-v1');
    first.persist.mockClear();
    first.notifySaved({ patientId: PID, snapshotCount: 2 });
    expect(first.indicator.getState()).toBe('dirty');
    expect(shared.storage.get('vilda-save-ref-v1')).toBe(reference);
    expect(first.persist).not.toHaveBeenCalled();
  });

  it('pierwszy zapis przed nadaniem identyfikatora formularzowi nadal przechodzi', () => {
    const shared = tab();
    shared.storage.delete('vildaCurrentPatientId');
    const first = frame(shared);
    first.notifySaved({ patientId: PID, snapshotCount: 1, header: { name: shared.session.name } });
    expect(first.indicator.getState()).toBe('saved');
    expect(first.indicator.getReferenceFingerprint()).toBe(first.indicator._computeCanonicalFingerprint());
  });

  it.each(['clear', 'lock'])('zaległe uzgodnienie po %s nie przywraca poprzedniego stanu ani referencji', operation => {
    const shared = tab();
    const first = frame(shared);
    first.saved();
    first.emit('vilda:persist-restored');
    if (operation === 'clear') {
      first.win.__vildaPersistClearUntil = Date.now() + 2500;
      first.indicator._onUserStateCleared();
    } else first.indicator._onLock();
    vi.advanceTimersByTime(200);
    expect(first.indicator.getState()).toBe('hidden');
    expect(first.indicator.getReferenceFingerprint()).toBeNull();
    expect(shared.storage.has('vilda-save-ref-v1')).toBe(false);
  });

  it.each([false, true])('podstrona bez formularza rozpoznaje zapis ze wspólnej sesji (dirty=%s)', dirty => {
    const shared = tab();
    const first = frame(shared);
    first.saved();
    if (dirty) { first.editWeight(42); first.compare(); }
    const reference = shared.storage.get('vilda-save-ref-v1');
    const passive = frame(shared, { passive: true });
    expect(passive.indicator.getState()).toBe(dirty ? 'dirty' : 'saved');
    expect(passive.indicator.getLastSnapshotCount()).toBe(1);
    expect(passive.indicator.getReferenceFingerprint()).toBe(first.indicator.getReferenceFingerprint());
    expect(shared.storage.get('vilda-save-ref-v1')).toBe(reference);
    expect(passive.persist).not.toHaveBeenCalled();
  });

  it('podstrona bez formularza porównuje sesję przy starcie zamiast ufać nieaktualnej fladze dirty', () => {
    const shared = tab();
    const first = frame(shared);
    first.saved();
    shared.session.user.weight = 42; // Inna ramka zdążyła utrwalić dane, status jeszcze nie.
    const passive = frame(shared, { passive: true });
    expect(passive.indicator.getState()).toBe('dirty');
    expect(JSON.parse(shared.storage.get('vilda-save-ref-v1')).dirty).toBe(false);
    expect(passive.persist).not.toHaveBeenCalled();
  });

  it('podstrona bez formularza pokazuje nowego pacjenta, gdy dane nie mają referencji zapisu', () => {
    const passive = frame(tab(), { passive: true });
    expect(passive.indicator.getState()).toBe('new_patient');
    expect(passive.indicator.isReadyForSharedReference()).toBe(true);
    expect(passive.indicator.getReferenceFingerprint()).toBeNull();
  });

  it('same preferencje modułów bez tożsamości i pomiarów nie tworzą pacjenta na lekkiej podstronie', () => {
    const shared = tab();
    shared.session = { doctor: { name: 'Fikcyjny lekarz' }, zscore: { resultsMode: true }, user: { sex: 'M' } };
    expect(frame(shared, { passive: true }).indicator.getState()).toBe('hidden');
  });

  it('lekka podstrona przyjmuje zmianę wspólnej sesji przez storage bez zapisu jej danych', () => {
    const shared = tab();
    const first = frame(shared);
    first.saved();
    const passive = frame(shared, { passive: true });
    shared.session.user.weight = 42;
    const reference = shared.storage.get('vilda-save-ref-v1');
    passive.emitWindow('storage', { key: 'vildaMainSessionV1' });
    vi.advanceTimersByTime(200);
    expect(passive.indicator.getState()).toBe('dirty');
    expect(shared.session.user.weight).toBe(42);
    expect(shared.storage.get('vilda-save-ref-v1')).toBe(reference);
    expect(passive.persist).not.toHaveBeenCalled();
  });

  it.each(['clear', 'lock'])('lekka podstrona czyści chip po %s i nie wskrzesza go od zaległych zdarzeń', operation => {
    const shared = tab();
    const first = frame(shared);
    first.saved();
    const passive = frame(shared, { passive: true });
    const reference = shared.storage.get('vilda-save-ref-v1');
    passive.emitWindow('storage', { key: 'vildaMainSessionV1' });
    if (operation === 'clear') {
      shared.session = null;
      passive.win.__vildaPersistClearUntil = Date.now() + 2500;
      passive.indicator._onUserStateCleared();
    } else passive.indicator._onLock();
    vi.advanceTimersByTime(200);
    expect(passive.indicator.getState()).toBe('hidden');
    expect(passive.indicator.getReferenceFingerprint()).toBeNull();
    expect(shared.storage.get('vilda-save-ref-v1')).toBe(reference);
    expect(passive.persist).not.toHaveBeenCalled();
  });

  it('kolejny zapis już zielonego chipa odświeża opublikowane metadane od razu', () => {
    const shared = tab();
    const first = frame(shared);
    first.saved(1);
    first.saved(2);
    expect(first.indicator.getState()).toBe('saved');
    expect(first.win.__vildaSaveStatusState.lastSnapshotCount).toBe(2);
  });

  it.each(['save', 'load', 'restore', 'choice', 'import', 'input'])('lekka podstrona nie zatwierdza wspólnych niezapisanych danych po %s', signal => {
    const shared = tab();
    const first = frame(shared);
    first.saved();
    first.editWeight(42);
    const passive = frame(shared, { passive: true });
    const reference = shared.storage.get('vilda-save-ref-v1');
    expect(passive.indicator.getState()).toBe('dirty');
    if (signal === 'save') passive.notifySaved({ patientId: PID, snapshotCount: 2 });
    else if (signal === 'load') passive.emit('vilda:patient-loaded', { patientId: PID });
    else if (signal === 'restore') passive.emit('vilda:state-restored');
    else if (signal === 'choice') passive.emit('vilda:load-choice-applied', { choice: 'new', patientId: PID, applySequence: 1 });
    else if (signal === 'import') passive.emit('vilda:json-imported', { name: shared.session.name });
    else passive.emit('input', undefined, true);
    vi.advanceTimersByTime(400);
    expect(passive.indicator.getState()).toBe('dirty');
    expect(shared.storage.get('vilda-save-ref-v1')).toBe(reference);
    expect(shared.session.user.weight).toBe(42);
    expect(passive.persist).not.toHaveBeenCalled();
  });
});
