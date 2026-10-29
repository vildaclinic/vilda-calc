import { expect } from '@playwright/test';

// Only fictional patient data. These tests never create/unlock a real vault.
// The explicit facade replaces encrypted I/O and its session-presence probe;
// production clinical code, note writers, shared saved-result readers,
// renderers and navigation remain untouched.
export const PATIENT_ID = 'fictional-klirens-record-patient';
export const OTHER_PATIENT_ID = 'fictional-klirens-record-other';
export const PATIENT = {
  name: 'Fikcyjna Pacjentka Nerkowa',
  user: { name: 'Fikcyjna Pacjentka Nerkowa', sex: 'F', age: 10, ageMonths: 0, height: 140, weight: 32 },
};

export async function prepareBrowser(page) {
  await page.route(/^https:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.sheetjs\.com|cdn\.jsdelivr\.net)\//, route => route.abort());
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    // Preserve production observers registered before the I/O facade is
    // installed. Actual browser startup and guest mode still use the original
    // locked vault; the wrapper only records public subscription callbacks.
    window.__clcrEarlyNoteListeners = new Set();
    let exportedVault;
    Object.defineProperty(window, 'VildaVault', {
      configurable: true,
      get: () => exportedVault,
      set: value => {
        exportedVault = value;
        if (!value || typeof value.onPatientNoteChanged !== 'function' || value.__clcrSubscriptionProbe) return;
        const subscribe = value.onPatientNoteChanged.bind(value);
        value.onPatientNoteChanged = listener => {
          window.__clcrEarlyNoteListeners.add(listener);
          return subscribe(listener);
        };
        Object.defineProperty(value, '__clcrSubscriptionProbe', { value: true });
      },
    });
  });
}

export async function enterGuest(scope, { calculator = false } = {}) {
  await scope.waitForFunction(() => Boolean(window.VildaSession || window.VildaAuthUI));
  await scope.evaluate(() => window.VildaSession?.ensureAuthLoaded());
  await scope.waitForFunction(() => Boolean(window.VildaVault && window.VildaAuthUI));
  const guest = scope.getByRole('button', { name: 'Korzystaj bez logowania', exact: true });
  if (await guest.isVisible()) await guest.evaluate(button => button.click());
  await scope.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  if (calculator) await waitForCalculatorReady(scope);
  const decline = scope.locator('#consent-decline');
  if (await decline.isVisible()) await decline.click();
}

export async function waitForCalculatorReady(scope) {
  await scope.waitForFunction(() => document.documentElement.classList.contains('clcr-workflow-ready') &&
    typeof window.applyClcrSessionSnapshot === 'function' && Boolean(window.ClcrUiWorkflow && window.ClcrVisitSave) &&
    window.clcrIsResetting !== true);
}

export async function installMemoryVault(scope, { patientId = PATIENT_ID, select = true } = {}) {
  await scope.evaluate(({ pid, otherId, patient, shouldSelect }) => {
    const host = window.top;
    const original = window.VildaVault;
    if (!original || original.isUnlocked()) throw new Error('Original vault must exist and remain locked');
    if (window.__clcrRecordOriginalVault) return;
    window.__clcrRecordOriginalVault = original;
    const clone = value => JSON.parse(JSON.stringify(value));
    if (!host.__clcrRecordStore) {
      const payloads = new Map([[pid, patient], [otherId, {
        name: 'Fikcyjny Drugi Pacjent', user: { name: 'Fikcyjny Drugi Pacjent', sex: 'M', age: 15, ageMonths: 0, height: 165, weight: 50 },
      }]]);
      host.__clcrRecordStore = {
        notes: new Map(), tombstones: new Set(), payloads, series: [], windows: new Set(), originalVaults: new Set(), observerErrors: [],
        unlocked: true, userId: 'fictional-klirens-account', sequence: 0, saves: [], updates: [], deletes: [], noteReads: [],
        patientReads: [], patientSaves: [], holdPatientReads: false, pendingPatientReads: [], failPatientReads: false,
        failBefore: [], failAfter: [], hold: false, pending: [], rejectUpdate: null, rejectDelete: null,
      };
    }
    const store = host.__clcrRecordStore;
    store.windows.add(window);
    // Keep actual locked vault objects, not WindowProxy lookups that can point
    // at a replacement document after legitimate application navigation.
    store.originalVaults.add(original);
    window.__clcrFacadeNoteListeners = new Set();
    const notify = (patientId, noteId, action) => {
      // Only the writer window gets local vault callbacks. Other documents
      // must refresh through the application's real metadata-only BC/storage
      // invalidation path; directly calling sibling callbacks would hide bugs.
      const callbacks = new Set([...(window.__clcrEarlyNoteListeners || []), ...window.__clcrFacadeNoteListeners]);
      for (const listener of callbacks) {
        try { listener({ patientId, noteId, action }); }
        catch (error) { store.observerErrors.push(String(error)); }
      }
      const ping = { type: 'note-changed', ts: Date.now(), sender: 'fictional-klirens-record-io', action };
      if (typeof BroadcastChannel === 'function') {
        const channel = new BroadcastChannel('vilda-notes'); channel.postMessage(ping); channel.close();
      }
      localStorage.setItem('vilda-note-changed-ping-v1', JSON.stringify(ping));
    };
    const ensureUnlocked = () => { if (!store.unlocked) throw new Error('Fictional vault locked'); };
    const noteValue = (payload, previous) => {
      const now = new Date().toISOString();
      return {
        ...clone(payload), id: payload.id || `fictional-note-${++store.sequence}`,
        title: String(payload.title || ''), body: original.sanitizeNoteText(payload.body),
        labResult: payload.labResult ? original.sanitizeLabResult(payload.labResult) : null,
        rev: (previous?.rev || 0) + 1, createdAtISO: previous?.createdAtISO || now, updatedAtISO: now,
      };
    };
    const rejected = (id, patientId, baseRev, flag) => {
      const current = store.notes.get(id);
      if (flag) return { id, [flag]: false, reason: flag === 'updated' ? store.rejectUpdate : store.rejectDelete };
      if (store.tombstones.has(id)) return { id, reason: 'deleted' };
      if (!current) return { id, reason: 'missing' };
      if (current.patientId !== patientId) return { id, reason: 'patient-mismatch' };
      if (current.rev !== baseRev) return { id, reason: 'conflict', conflict: true, rev: current.rev, current: clone(current) };
      return null;
    };
    const canonical = payload => ({
      patientId: payload.patientId, category: payload.category || 'observation',
      title: original.sanitizeNoteText(payload.title || '').trim(), body: original.sanitizeNoteText(payload.body),
      clinicalDateISO: payload.clinicalDateISO || null,
      labResult: payload.labResult ? original.sanitizeLabResult(payload.labResult) : null,
      linkedAgeMonths: Number.isFinite(payload.linkedAgeMonths) ? payload.linkedAgeMonths : null,
    });
    const persist = async (payload, once) => {
      ensureUnlocked();
      if (once && (!payload.id || !payload.patientId)) throw new Error('Fictional once-write requires allocated IDs');
      const attempt = store.saves.length + 1; store.saves.push(clone(payload));
      if (store.hold) await new Promise(resolve => { store.pending.push(resolve); });
      ensureUnlocked();
      if (store.failBefore.includes(attempt)) throw new Error(`Fictional failure before write ${attempt}`);
      const previous = payload.id ? store.notes.get(payload.id) : null;
      if (once) {
        if (store.tombstones.has(payload.id)) return { id: payload.id, saved: false, reason: 'deleted' };
        if (previous) return JSON.stringify(canonical(previous)) === JSON.stringify(canonical(payload))
          ? { id: payload.id, saved: true, reused: true }
          : { id: payload.id, saved: false, reason: 'conflict', conflict: true };
      }
      const note = noteValue(payload, previous);
      store.notes.set(note.id, note); notify(note.patientId, note.id, previous ? 'update' : 'save');
      if (store.failAfter.includes(attempt)) throw new Error(`Fictional transport failure after write ${attempt}`);
      return { id: note.id, isNew: !previous, updatedAtISO: note.updatedAtISO, ...(once ? { saved: true, reused: false } : {}) };
    };
    window.VildaVault = {
      isUnlocked: () => store.unlocked,
      getCurrentUser: () => ({ userId: store.userId }),
      getPatient: async id => {
        ensureUnlocked(); store.patientReads.push(id);
        // Capture the response before deliberately holding I/O, so the test can
        // prove a late response cannot authorize another patient's current UI.
        const payload = clone(store.payloads.get(id) || null);
        if (store.holdPatientReads) await new Promise(resolve => { store.pendingPatientReads.push(resolve); });
        ensureUnlocked();
        if (store.failPatientReads) throw new Error('Fictional patient read failed');
        if (!payload) return null;
        return { id, patientId: id, snapshotCount: 1, header: { name: payload.name, age: Number(payload.user.age), sex: payload.user.sex },
          snapshots: [{ snapshotId: `fictional-snapshot-${id}`, savedAtISO: '2026-10-20T12:00:00.000Z', payload: clone(payload) }] };
      },
      savePatient: async (payload, options = {}) => {
        ensureUnlocked();
        const id = options.patientId || `fictional-created-patient-${++store.sequence}`;
        const isNew = !store.payloads.has(id);
        store.patientSaves.push({ patientId: id, payload: clone(payload), options: clone(options) });
        store.payloads.set(id, clone(payload));
        return { patientId: id, snapshotId: `fictional-snapshot-${id}`, isNew,
          savedAtISO: new Date().toISOString(), updatedAtISO: new Date().toISOString() };
      },
      listPatients: async () => {
        ensureUnlocked(); return [...store.payloads].map(([id, payload]) => ({ patientId: id,
          header: { name: payload.name, age: Number(payload.user.age), sex: payload.user.sex },
          snapshotCount: 1, updatedAtISO: '2026-10-20T12:00:00.000Z' }));
      },
      listExternalPatients: async () => [], countLegacyExternalNotes: async () => 0,
      getPatientNote: async id => { ensureUnlocked(); store.noteReads.push(id); return clone(store.notes.get(id) || null); },
      listPatientNotesForPatient: async id => { ensureUnlocked(); return clone([...store.notes.values()].filter(note => note.patientId === id)); },
      // Klirens notes intentionally need not exist in the generic laboratory
      // index (e.g. a negative UAG). Their reader must use the full note list.
      listPatientLabSeries: async id => {
        ensureUnlocked(); return clone(store.series.map(series => ({ ...series,
          points: series.points.filter(point => store.notes.get(point.noteId)?.patientId === id),
        })).filter(series => series.points.length));
      },
      listPatientTreatmentPeriods: async () => [], listPatientTimelineEvents: async () => [], listPatientNotesDueByDate: async () => [],
      onPatientNoteChanged: listener => { window.__clcrFacadeNoteListeners.add(listener); return () => window.__clcrFacadeNoteListeners.delete(listener); },
      savePatientNote: payload => persist(payload, false),
      savePatientNoteOnce: payload => persist(payload, true),
      updateExistingPatientNote: async payload => {
        ensureUnlocked(); store.updates.push(clone(payload));
        const error = rejected(payload.id, payload.patientId, payload.baseRev, store.rejectUpdate ? 'updated' : null);
        if (error) return { ...error, isNew: false, updated: false };
        const note = noteValue(payload, store.notes.get(payload.id));
        store.notes.set(note.id, note); notify(note.patientId, note.id, 'update');
        return { id: note.id, isNew: false, updated: true, updatedAtISO: note.updatedAtISO };
      },
      removeExistingPatientNote: async payload => {
        ensureUnlocked(); store.deletes.push(clone(payload));
        const error = rejected(payload.id, payload.patientId, payload.baseRev, store.rejectDelete ? 'removed' : null);
        if (error) return { ...error, removed: false };
        store.notes.delete(payload.id); store.tombstones.add(payload.id); notify(payload.patientId, payload.id, 'delete');
        return { id: payload.id, removed: true };
      },
      sanitizeNoteText: original.sanitizeNoteText, sanitizeLabResult: original.sanitizeLabResult,
    };
    // The isolated facade represents an already authenticated fictional account.
    // Align its public UI state without invoking a real login/logout transition;
    // the original encrypted vault objects remain locked and are checked below.
    window.VildaGuestMode = false;
    // Frame sync compares these two public authentication predicates on every
    // sibling auth ping. The fictional vault and its session must agree or a
    // delayed guest-mode ping reloads this document and discards the fixture.
    // This facade exposes presence only; no real session key is created.
    window.VildaSession.hasSessionKey = () => store.unlocked;
    // A private UI fixture does not create real audit-log writes.
    window.VildaAuditLog = { log: () => {} };
    window.__clcrRecordFixture = {
      snapshot: () => ({ notes: clone([...store.notes.values()]), saves: clone(store.saves), updates: clone(store.updates),
        deletes: clone(store.deletes), noteReads: [...store.noteReads], patientReads: [...store.patientReads],
        patientSaves: clone(store.patientSaves), pendingPatientReads: store.pendingPatientReads.length, tombstones: [...store.tombstones], pending: store.pending.length,
        unlocked: store.unlocked, observerErrors: [...store.observerErrors], originalsLocked: [...store.originalVaults].every(originalVault => !originalVault.isUnlocked()) }),
      configure: options => Object.assign(store, options),
      release: () => { store.hold = false; for (const resolve of store.pending.splice(0)) resolve(); },
      releasePatientReads: () => { store.holdPatientReads = false; for (const resolve of store.pendingPatientReads.splice(0)) resolve(); },
      removePatient: id => { store.payloads.delete(id); },
      seed: notes => { for (const note of notes) store.notes.set(note.id, clone(note)); },
      addSeries: series => store.series.push(clone(series)),
      removeExternally: id => { const note = store.notes.get(id); store.notes.delete(id); store.tombstones.add(id); if (note) notify(note.patientId, id, 'delete'); },
    };
    if (shouldSelect) {
      sessionStorage.setItem('vildaCurrentPatientId', pid);
      document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: pid, patientName: patient.name } }));
      window.ClcrVisitSave?._setPatientId(pid); window.ClcrVisitSave?._refresh();
    }
  }, { pid: patientId, otherId: OTHER_PATIENT_ID, patient: PATIENT, shouldSelect: select });
}

export const memory = scope => scope.evaluate(() => window.__clcrRecordFixture.snapshot());
export const configureMemory = (scope, options) => scope.evaluate(options => window.__clcrRecordFixture.configure(options), options);
export const releaseWrites = scope => scope.evaluate(() => window.__clcrRecordFixture.release());
export const releasePatientReads = scope => scope.evaluate(() => window.__clcrRecordFixture.releasePatientReads());

export async function selectPatient(scope, patientId = PATIENT_ID) {
  await scope.evaluate(pid => {
    if (pid) sessionStorage.setItem('vildaCurrentPatientId', pid);
    else sessionStorage.removeItem('vildaCurrentPatientId');
    const name = pid ? window.top.__clcrRecordStore.payloads.get(pid)?.name || '' : '';
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: pid, patientName: name } }));
    window.ClcrVisitSave?._setPatientId(pid); window.ClcrVisitSave?._refresh();
  }, patientId);
}

export async function openCalculator(page, { width = 1440, select = true } = {}) {
  await prepareBrowser(page); await page.setViewportSize({ width, height: 1000 });
  await page.goto('/kalkulator-klirens.html', { waitUntil: 'domcontentloaded' });
  await enterGuest(page, { calculator: true });
  await installMemoryVault(page, { select });
  return page;
}

export async function applyAcr(scope, albumin = '45', { age = '10', creatinine = '100' } = {}) {
  expect(await scope.evaluate(({ albuminValue, creatinineValue, ageYears }) => window.applyClcrSessionSnapshot({
    version: 2, currentVersion: 'spot', selectedFormula: 'ACR', inputs: {
      currentVersion: 'spot', formulaPicker: 'ACR', fullName: 'Fikcyjna Pacjentka Nerkowa', age: ageYears, ageMonths: '', ageDays: '', sex: 'F',
      U_Alb: albuminValue, U_Alb_unit: 'mg/L', Ucr_spot: creatinineValue, Ucr_spot_unit: 'mg/dl',
      ACR_entry_mode: 'concentration', ACR_reported: '', ACR_reported_unit: 'mg/g', ACR_same_specimen: '', spotSampleKind: '',
      spotMenstruation: false, spotHematuria: false, spotInfection: false, spotExercise: false, spotAcuteIllness: false,
    },
  }, { source: 'e2e-fictional-patient-record', update: true, dispatchEvents: false, preserveAcrossVersions: true }),
  { albuminValue: albumin, creatinineValue: creatinine, ageYears: age })).toBe(true);
  await expect(scope.locator('#clcrResultReport .clcr-result-card[data-clcr-series="ACR"]')).toBeVisible();
}

export async function applyU25(scope, creatinine = '0.600') {
  await scope.evaluate(() => window.ClcrUiWorkflow.selectFormula('ckid_u25'));
  await scope.waitForFunction(() => window.ClcrUiWorkflow.state.activeFormulaId === 'ckid_u25' && window.clcrIsResetting !== true);
  await scope.evaluate(scr => {
    const fields = { age: '10', ageMonths: '', ageDays: '', sex: 'F', height: '140', Scr: scr, ScrUnit: 'mg/dl', ScrAssay: 'enzymatic_idms', creatinineState: 'stable' };
    for (const [id, value] of Object.entries(fields)) {
      const element = document.getElementById(id); if (!element) throw new Error(`Missing fixture input ${id}`);
      element.value = value; element.dispatchEvent(new Event('change', { bubbles: true }));
    }
    window.clcrUpdate();
  }, creatinine);
  await expect(scope.locator('#clcrResultReport .clcr-result-card[data-clcr-series="ckid_u25"]')).toBeVisible();
}

export async function saveVisible(scope, clinicalDateISO = '2026-10-25') {
  await scope.locator('#clcrVisitDate').fill(clinicalDateISO);
  const before = await memory(scope);
  await expect(scope.locator('#clcrVisitSaveBtn')).toBeEnabled();
  await scope.locator('#clcrVisitSaveBtn').click();
  await expect(scope.locator('#clcrVisitStatus')).toContainText('Zapisano');
  const after = await memory(scope);
  expect(after.originalsLocked).toBe(true);
  return after.notes.filter(note => !before.notes.some(old => old.id === note.id));
}

export async function shellFrame(page, title) {
  const iframe = page.locator(`iframe.app-pane[title="${title}"]`);
  await expect(iframe).toBeVisible();
  // The shell shows an iframe before its document has loaded. Its own loading
  // overlay is cleared by the active pane's production load handler.
  await page.waitForFunction(() => document.getElementById('appShellSkeleton')?.hidden === true);
  const frame = await (await iframe.elementHandle()).contentFrame();
  if (!frame) throw new Error(`Missing actual app frame: ${title}`);
  return frame;
}

export async function openShellCalculator(page, { width = 1440, select = true } = {}) {
  await prepareBrowser(page); await page.setViewportSize({ width, height: 1000 });
  await page.goto('/app.html#/klirens', { waitUntil: 'domcontentloaded' });
  // The real shell owns its first guest/auth screen before any pane is visible.
  await enterGuest(page);
  await page.evaluate(() => { window.location.hash = '#/klirens'; });
  const calculator = await shellFrame(page, 'Kalkulator klirensu');
  await enterGuest(calculator, { calculator: true }); await installMemoryVault(calculator, { select });
  // Preload the actual Start pane so the real Shell can open its main card.
  await page.evaluate(() => { window.location.hash = '#/start'; });
  const start = await shellFrame(page, 'Start');
  await enterGuest(start); await installMemoryVault(start, { select });
  await page.evaluate(() => { window.location.hash = '#/klirens'; });
  await shellFrame(page, 'Kalkulator klirensu');
  await waitForCalculatorReady(calculator);
  return { calculator, start };
}

export async function applyProtein(scope) {
  await scope.evaluate(() => window.ClcrUiWorkflow.selectFormula('Prot_mgkg'));
  await scope.waitForFunction(() => window.ClcrUiWorkflow.state.activeFormulaId === 'Prot_mgkg' && window.clcrIsResetting !== true);
  await scope.evaluate(() => {
    const values = { age: '10', ageMonths: '', ageDays: '', sex: 'F', weight: '30', height: '140', U_Prot: '1500',
      collectionStartAt: '2026-10-24T08:00', collectionEndAt: '2026-10-25T08:00' };
    for (const [id, value] of Object.entries(values)) {
      const element = document.getElementById(id); if (!element) throw new Error(`Missing protein fixture field ${id}`);
      element.value = value; element.dispatchEvent(new Event('change', { bubbles: true }));
    }
    for (const id of ['collectionStartVoidDiscarded', 'collectionFinalVoidIncluded', 'collectionNoMissedVoids',
      'collectionNoSpillage', 'collectionNoExtraVoids', 'collectionStorageFollowed']) {
      const element = document.getElementById(id); element.checked = true; element.dispatchEvent(new Event('change', { bubbles: true }));
      const answer = document.getElementById(`ui_${id}_answer`);
      if (answer) { answer.value = 'yes'; answer.dispatchEvent(new Event('change', { bubbles: true })); }
    }
    window.clcrUpdate();
  });
  await expect.poll(() => scope.evaluate(() => window.ClcrVisitSave.collectActiveDatapoints(document, { formulaId: 'Prot_mgkg' }).length)).toBe(3);
}
