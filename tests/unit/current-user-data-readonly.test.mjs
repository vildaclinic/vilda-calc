import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const base = () => ({ version: 1, name: 'Fikcyjny Test Odczytu', user: { sex: 'M', age: 12, ageMonths: 0, height: 145, weight: 35, tannerStage: '2' },
  intake: { pal: '1.8', history: [{ ageMonths: 130, height: 140 }], estKcalPerDay: 2000 },
  foods: { snacks: [{ key: 'fictional', qty: 1 }], meals: [] }, puberty: { onsetAgeYears: 9 },
  clcr: { inputs: { Scr: 'old-stored' } }, extension: { preserved: true } });
function environment(ids = ['name', 'age', 'ageMonths', 'sex', 'height', 'weight']) {
  const fields = new Map(), listeners = new Map(), writes = vi.fn(), events = vi.fn(), timers = vi.fn(() => 0);
  for (const id of ids) fields.set(id, { id, value: '', checked: false, style: {}, dataset: {}, tagName: 'INPUT',
    addEventListener() {}, dispatchEvent: events, setAttribute() {}, removeAttribute() {}, getAttribute: () => null,
    classList: { add() {}, remove() {}, contains: () => false } });
  const doc = { readyState: 'loading', getElementById: id => fields.get(id) || null, querySelector: () => null, querySelectorAll: () => [],
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
    dispatchEvent(event) { events(event); (listeners.get(event.type) || []).forEach(fn => fn(event)); } };
  const storage = new Map([['vildaCurrentPatientId', 'fictional-readonly-patient']]);
  const win = { document: doc, location: { pathname: '/docpro.html' }, setTimeout: timers, clearTimeout: vi.fn(), addEventListener() {}, dispatchEvent: events,
    sessionStorage: { getItem: key => storage.get(key) || null, setItem: writes, removeItem: writes },
    VildaPersistence: { readMainSession: () => base(), readClcrSession: () => base().clcr, writeMainSession: writes, writeClcrSession: writes, updateShared: writes },
    VildaVault: { isUnlocked: () => true, onLock() {}, savePatient: writes },
    crypto: { randomUUID: vi.fn(() => 'fictional-observation-id') },
    VildaDobAge: { readISO: () => null, readWeeks: () => null, readMeasuredAtISO: () => null },
    Event: class { constructor(type) { this.type = type; } }, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } } };
  for (const file of ['vilda_puberty_assessment.js', 'vilda_puberty_assessment_state.js', 'vilda_bone_age.js', 'vilda_data_import_export.js']) loadBrowserScript(file, win);
  for (const [id, value] of Object.entries({ name: base().name, age: '12', ageMonths: '0', sex: 'M', height: '145', weight: '35' })) if (fields.has(id)) fields.get(id).value = value;
  writes.mockClear(); events.mockClear(); timers.mockClear(); win.crypto.randomUUID.mockClear();
  return { win, fields, writes, events, timers, api: win.VildaDataImportExport,
    capture: previous => win.VildaDataImportExport.captureCurrentUserDataReadOnly({ base: previous || base() }) };
}

describe('synchronous current user capture without persistence or RAM anchoring', () => {
  it('overlays owned explicit blanks and false while carrying sections absent from DocPro', () => {
    const h = environment(['name', 'age', 'ageMonths', 'sex', 'height', 'weight', 'dietLevel']);
    const previous = base(); previous.plan = { dietLevel: 'reduction', dietaWybrana: true }; h.fields.get('weight').value = '';
    const before = clone(previous), result = h.capture(previous);
    expect(result.user.weight).toBeNull(); expect(result.plan).toMatchObject({ dietLevel: null, dietaWybrana: false });
    expect(result.intake).toEqual(previous.intake); expect(result.foods).toEqual(previous.foods); expect(result.extension).toEqual(previous.extension);
    expect(previous).toEqual(before); expect(h.writes).not.toHaveBeenCalled(); expect(h.events).not.toHaveBeenCalled(); expect(h.timers).not.toHaveBeenCalled();
  });

  it('lets full Start empty arrays/nulls win rather than reviving an older history or foods', () => {
    const h = environment(['name', 'age', 'ageMonths', 'sex', 'height', 'weight', 'intakeMeasurements', 'foodRowsSection']);
    h.win.intakeHistory = []; h.win.intakeEstimatedKcalPerDay = null;
    const result = h.capture();
    expect(result.intake.history).toEqual([]); expect(result.intake.estKcalPerDay).toBeNull(); expect(result.foods).toEqual({ snacks: [], meals: [] });
    expect(h.writes).not.toHaveBeenCalled();
  });

  it('captures a legacy puberty-only edit atomically instead of restoring its previous value', () => {
    const h = environment(['tannerStage', 'pubertyOnsetAge']); h.fields.get('tannerStage').value = '4'; h.fields.get('pubertyOnsetAge').value = '';
    const result = h.capture(); expect(result.user.tannerStage).toBe('4'); expect(result.puberty).toBeNull();
    expect(h.writes).not.toHaveBeenCalled(); expect(h.events).not.toHaveBeenCalled();
  });

  it.each([['M', 'G'], ['F', 'Th'], ['F', 'P']])('includes the live detailed %s/%s edit before its debounce without writing', (sex, axis) => {
    const h = environment(); h.fields.get('sex').value = sex;
    expect(h.win.VildaPubertyAssessmentState.editObservation(axis, 3)).toEqual({ ok: true });
    h.writes.mockClear(); h.events.mockClear(); h.timers.mockClear(); h.win.crypto.randomUUID.mockClear();
    const revision = h.win.VildaPubertyAssessmentState.getActivityRevision(), result = h.capture();
    expect(result.user.pubertyAssessment.observations[axis].stage).toBe(3);
    expect(h.win.VildaPubertyAssessmentState.getActivityRevision()).toBe(revision);
    expect(h.writes).not.toHaveBeenCalled(); expect(h.events).not.toHaveBeenCalled(); expect(h.timers).not.toHaveBeenCalled(); expect(h.win.crypto.randomUUID).not.toHaveBeenCalled();
  });

  it('uses the live renal readonly API and never flushes or substitutes its older stored session', () => {
    const h = environment(['clcrForm']); const save = vi.fn(() => { throw new Error('Forbidden flush'); });
    h.win.VildaClcrSessionRuntime = { saveNow: save, captureCurrentSessionReadOnly: () => ({ version: 2, inputs: { Scr: '1.25', U_Alb: '0' }, preservedInputs: {} }) };
    const result = h.capture(); expect(result.clcr.inputs).toEqual({ Scr: '1.25', U_Alb: '0' }); expect(save).not.toHaveBeenCalled(); expect(h.writes).not.toHaveBeenCalled();
    delete h.win.VildaClcrSessionRuntime.captureCurrentSessionReadOnly;
    expect(() => h.capture()).toThrow(/CURRENT_DATA_CAPTURE_UNAVAILABLE/);
  });

  it('projects bone-age context onto a detached result without changing DOM/RAM or allocating identities', () => {
    const h = environment(['name', 'age', 'ageMonths', 'sex', 'height', 'weight', 'advBoneAge']);
    h.win.VildaBoneAge.load({ ...base(), advanced: { boneAgeYears: 10 } }, { restore: true });
    const globals = clone(h.win.vildaBoneAgeContext), field = h.fields.get('advBoneAge').value;
    h.writes.mockClear(); h.events.mockClear(); h.timers.mockClear(); h.win.crypto.randomUUID.mockClear();
    const result = h.capture(); expect(result.advanced.boneAgeContext.current.years).toBe(10);
    expect(h.win.vildaBoneAgeContext).toEqual(globals); expect(h.fields.get('advBoneAge').value).toBe(field);
    result.advanced.boneAgeContext.current.years = 1; expect(h.win.vildaBoneAgeContext).toEqual(globals);
    expect(h.writes).not.toHaveBeenCalled(); expect(h.events).not.toHaveBeenCalled(); expect(h.win.crypto.randomUUID).not.toHaveBeenCalled();
  });

  it('keeps the original collector flush path available to normal save/export callers', () => {
    const h = environment(), saveNow = vi.fn(() => true); h.win.VildaClcrSessionRuntime = { saveNow };
    h.api.collectUserData(); expect(saveNow).toHaveBeenCalledWith({ force: true, reason: 'collect-user-data' });
  });

  it('projects a changed visit date/age for G without anchoring the live carrier', () => {
    const h = environment(), carrier = h.win.VildaPubertyAssessmentState;
    expect(carrier.editObservation('G', 3)).toEqual({ ok: true });
    h.fields.get('age').value = '13'; h.events.mockClear(); h.timers.mockClear(); h.writes.mockClear();
    const projected = h.capture(); expect(projected.user.pubertyAssessment.observations.G.ageMonths).toBe(156);
    // Existing capture under the explicit restore guard does not re-anchor. It
    // exposes the original carrier and proves the readonly projection left it.
    h.win.__vildaPersistRestoring = true;
    const untouched = carrier.capture();
    expect(untouched.raw.observations.G.ageMonths).toBe(144); expect(untouched.visitRaw.reference.ageMonths).toBe(144);
    expect(h.events).not.toHaveBeenCalled(); expect(h.writes).not.toHaveBeenCalled(); expect(h.timers).not.toHaveBeenCalled();
  });

  it('uses the actual renal readonly builder for a rapid live edit without touching its stored draft or version vault', () => {
    const h = environment(), controls = [
      { id: 'formulaPicker', type: 'select-one', value: 'Schwartz' }, { id: 'Scr', type: 'text', value: '1.25' }, { id: 'Scr_unit', type: 'text', value: 'mg/dL' }
    ];
    controls.forEach(control => h.fields.set(control.id, control));
    h.fields.set('clcrForm', { id: 'clcrForm', querySelectorAll: () => controls });
    h.win.currentVersion = 'basic'; h.win.__vildaClcrVersionValueVault = Object.freeze({ hiddenFictionalInput: 'retained', Scr: 'old-vault' });
    h.win.__vildaClcrPreserveVersionValues = true;
    const context = vm.createContext({ window: h.win, document: h.win.document, setTimeout: h.timers, clearTimeout() {} });
    for (const file of ['clcr_collection_duration.js', 'inline_kalkulator_klirens_07.js']) vm.runInContext(readFileSync(new URL('../../' + file, import.meta.url), 'utf8'), context);
    h.writes.mockClear(); h.events.mockClear(); h.timers.mockClear();
    const oldVault = h.win.__vildaClcrVersionValueVault, result = h.capture();
    expect(result.clcr.inputs).toMatchObject({ Scr: '1.25', Scr_unit: 'mg/dL', hiddenFictionalInput: 'retained' });
    expect(result.clcr.preservedInputs.Scr).toBe('1.25'); expect(h.win.__vildaClcrVersionValueVault).toBe(oldVault); expect(oldVault.Scr).toBe('old-vault');
    expect(h.win.VildaPersistence.readClcrSession()).toEqual(base().clcr); expect(h.writes).not.toHaveBeenCalled(); expect(h.events).not.toHaveBeenCalled(); expect(h.timers).not.toHaveBeenCalled();
  });

  it('shares the complete original serializer output when there is no unowned carry', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-31T12:00:00Z'));
    try {
      const h = environment(); h.win.VildaPersistence.readClcrSession = () => null;
      expect(h.api.captureCurrentUserDataReadOnly({ base: null })).toEqual(h.api.collectUserData());
    } finally { vi.useRealTimers(); }
  });
});
