import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { oknoZSilnikiem, wczytajDoOkna } from '../support/silnik-bmi.mjs';

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const PID = 'fictional-automatic-pal-patient';
const record = () => ({ version: 1, name: 'Fikcyjny Pacjent Automatycznego PAL',
  user: { sex: 'M', age: 13, ageMonths: 0, weight: 46, height: 158, dobISO: '2013-06-17' } });

// Actual load -> main-session default synthesis -> actual save and exact vault
// result witness. The public BMI/PAL models generate the default; the test never
// reconstructs a clinical rule or grants a proof merely because PAL equals 1.6.
function environment(source = record()) {
  let main = null, owner = 'fictional-automatic-pal-owner', generation = 1, sequence = 0;
  const committed = new WeakMap(), fields = new Map(), storage = new Map([['vildaCurrentPatientId', PID]]), listeners = [];
  for (const id of ['name', 'age', 'ageMonths', 'sex', 'weight', 'height', 'dobInput']) fields.set(id, {
    id, value: '', dataset: {}, style: {}, disabled: false,
    addEventListener() {}, dispatchEvent() {}, setAttribute() {}, removeAttribute() {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  });
  const document = { readyState: 'loading', getElementById: id => fields.get(id) || null,
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener(type, callback, options) { listeners.push({ type, callback, capture: options === true || !!options?.capture }); },
    dispatchEvent(event) {
      for (const item of listeners.filter(item => item.type === event.type).sort((a, b) => Number(b.capture) - Number(a.capture))) item.callback(event);
      return true;
    },
  };
  const persistence = {
    getStorage: () => ({}), readMainSession: vi.fn(() => clone(main)), readClcrSession: () => null,
    writeMainSession(value) { main = clone(value); return true; }, clearMainSession() { main = null; },
  };
  const vault = {
    isUnlocked: () => true, getCurrentUser: () => ({ userId: owner }),
    captureSyncOperationSession: () => Object.freeze({ owner, generation }),
    assertSyncOperationSession(token) { if (token.owner !== owner || token.generation !== generation) throw new Error('Fikcyjna zmiana właściciela'); return true; },
    getCommittedSavePayload: result => clone(committed.get(result)),
    savePatient: vi.fn(async payload => {
      const result = { patientId: PID, snapshotId: `fictional-pal-snapshot-${++sequence}`, snapshotCount: sequence };
      committed.set(result, clone(payload)); return result;
    }),
  };
  const win = { document, VildaPersistence: persistence, VildaVault: vault,
    VildaPanelPacjent: { nieaktualny: () => false }, VildaAuthUI: { isBootReady: () => true },
    VildaDobAge: { restorePending: () => false, readISO: () => source.user.dobISO },
    location: { pathname: '/docpro.html' }, setTimeout: () => 0, clearTimeout() {}, addEventListener() {}, dispatchEvent() {},
    Event: class { constructor(type) { this.type = type; } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
  };
  const model = oknoZSilnikiem({ document }); wczytajDoOkna(model, 'vilda_diet_plan_ui.js');
  win.energyDefaultPlanPal = vi.fn((...args) => model.energyDefaultPlanPal(...args));
  win.energyNormalizePal = vi.fn((...args) => model.energyNormalizePal(...args));
  loadBrowserScript('vilda_data_import_export.js', win);
  const api = win.VildaDataImportExport;
  const partial = () => ({ ...clone(source), plan: { palFactor: null, palWybrany: false }, intake: { pal: null } });
  const options = { collectUserData: partial, syncSharedUserDataFromLoadedData() {} };
  api.initMainSessionPersistence(options); api.applyLoadedData(clone(source), options);
  return { win, api, fields, vault, persistence, options, main: () => clone(main),
    current: () => api.captureCurrentUserDataReadOnly({ base: main }),
    async save() { return api.saveUserDataWithReceipt(options); },
    chooseNew() { document.dispatchEvent(new win.CustomEvent('vilda:load-choice-applied', { detail: {
      choice: 'new', patientId: PID, applySequence: api.getApplyLoadedDataSequence(),
    } })); },
    changeOwner() { owner = 'fictional-automatic-pal-other-owner'; generation++; },
  };
}

describe('own-save automatic PAL comparison needs real synthesis provenance', () => {
  it('explains only generated defaults against the exact own null-PAL commit, without mutating or recapturing', async () => {
    const h = environment();
    expect(h.win.energyDefaultPlanPal).toHaveBeenCalledOnce(); expect(h.win.energyNormalizePal).toHaveBeenCalledOnce();
    expect(h.main().plan.palFactor).toBe(1.6); expect(h.main().intake.pal).toBe('1.6');
    // The native new-choice writer consumes the older technical marker. The
    // independent provenance remains valid for these same generated values.
    h.chooseNew();
    const receipt = await h.save(), current = h.current(), before = clone(current), stored = h.main();
    const selector = { patientId: PID, snapshotId: receipt.snapshotId, applySequence: h.api.getApplyLoadedDataSequence() };
    const committed = h.api.getCommittedSaveWitness(selector);
    expect(committed.payload.plan.palFactor).toBeNull(); expect(committed.payload.intake.pal).toBeNull();
    h.persistence.readMainSession.mockClear(); h.win.energyDefaultPlanPal.mockClear(); h.win.energyNormalizePal.mockClear();
    const proof = h.api.getOwnSaveAutomaticPalComparison(current);
    expect(proof).toEqual({ patientId: PID, payload: committed.payload, planPal: 1.6, intakePal: '1.6' });
    proof.payload.user.weight = 999;
    expect(h.api.getOwnSaveAutomaticPalComparison(current).payload).toEqual(committed.payload);
    expect(current).toEqual(before); expect(h.main()).toEqual(stored);
    expect(h.persistence.readMainSession).not.toHaveBeenCalled(); expect(h.win.energyDefaultPlanPal).not.toHaveBeenCalled();
    expect(h.win.energyNormalizePal).not.toHaveBeenCalled();
  });

  it.each(['plan', 'intake'])('does not invent provenance for a real imported %s PAL with the same default number', async field => {
    const source = record();
    if (field === 'plan') source.plan = { palFactor: 1.6, palWybrany: false }; else source.intake = { pal: '1.6' };
    const h = environment(source); await h.save();
    expect(h.api.getOwnSaveAutomaticPalComparison(h.current())).toBeNull();
  });

  it.each(['selected-plan', 'touched-plan', 'touched-intake', 'changed-plan', 'changed-intake', 'owned-plan', 'owned-intake', 'dob', 'identity', 'owner', 'new-load', 'clear'])('rejects %s instead of hiding a real edit or stale proof', async cause => {
    const h = environment(); await h.save(); const current = h.current();
    if (cause === 'selected-plan') current.plan.palWybrany = true;
    if (cause === 'touched-plan') h.win.__vildaPlanPalTouched = true;
    if (cause === 'touched-intake') h.win.__vildaIntakePalTouched = true;
    if (cause === 'changed-plan') current.plan.palFactor = 1.8;
    if (cause === 'changed-intake') current.intake.pal = '1.8';
    if (cause === 'owned-plan') h.fields.set('palFactor', { value: '1.6' });
    if (cause === 'owned-intake') h.fields.set('intakePal', { value: '1.6' });
    if (cause === 'dob') current.user.dobISO = '2013-06-18';
    if (cause === 'identity') current.name = 'Fikcyjny Inny Pacjent';
    if (cause === 'owner') h.changeOwner();
    if (cause === 'new-load') h.api.applyLoadedData(record(), h.options);
    if (cause === 'clear') h.api.clearAllData();
    expect(h.api.getOwnSaveAutomaticPalComparison(current)).toBeNull();
  });

  it('rejects a manually selected flag in the original source even if missing PAL is synthesized', async () => {
    const source = record(); source.plan = { palFactor: null, palWybrany: true };
    const h = environment(source); await h.save();
    expect(h.api.getOwnSaveAutomaticPalComparison(h.current())).toBeNull();
  });

  it('requires both exact committed PAL fields to be null', async () => {
    const h = environment(); h.options.collectUserData = () => ({ ...record(), plan: { palFactor: 1.8, palWybrany: false }, intake: { pal: null } });
    await h.save(); expect(h.api.getOwnSaveAutomaticPalComparison(h.current())).toBeNull();
  });
});
