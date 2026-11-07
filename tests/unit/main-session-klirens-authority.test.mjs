import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const OLD_RENAL = { version: 2, inputs: { Scr: '0.8', U_Alb: '30', suspectedAKI: true },
  preservedInputs: { Scr: '0.8', U_Alb: '30' }, summary: { clcr: [{ text: 'Fikcyjny dawny wynik' }] } };
const CURRENT_RENAL = { version: 2, inputs: { Scr: '', U_Alb: '', suspectedAKI: false },
  preservedInputs: { Scr: '', U_Alb: '' }, summary: { clcr: [] } };
const PAYLOAD = { version: 1, name: 'Fikcyjny Pacjent Bieżącej Sesji',
  user: { age: 13, sex: 'M', height: 158, weight: 46 },
  intake: { pal: '1.8', history: [{ ageMonths: 120, height: 141, weight: 33 }] }, clcr: OLD_RENAL };

function environment(options = {}) {
  const { unavailable = false, readError = false, intakeDom = false } = options;
  const current = Object.prototype.hasOwnProperty.call(options, 'current') ? options.current : CURRENT_RENAL;
  let main = clone(PAYLOAD), renal = clone(current);
  const mainWrites = [], renalWrites = [], restored = [];
  const lifecycle = [];
  let versionCache = { age: '15', U_Alb: '45', Ucr_spot: '100' };
  const clearVersionCache = () => { versionCache = {}; lifecycle.push({ type: 'clear-version-cache' }); return true; };
  const values = Object.fromEntries(['name', 'age', 'ageMonths', 'sex', 'height', 'weight']
    .map(id => [id, { id, value: '', style: {}, dataset: {}, addEventListener() {},
      dispatchEvent() {}, classList: { add() {}, remove() {}, contains: () => false } }]));
  for (const id of ['ageDays', 'U_Alb', 'Ucr_spot']) values[id] = { id, value: '', defaultValue: '', type: 'number', tagName: 'INPUT', style: {}, dataset: {}, dispatchEvent() {} };
  const persistence = {
    getStorage: () => ({}),
    readMainSession: () => clone(main),
    writeMainSession(value) { mainWrites.push(clone(value)); main = clone(value); return true; },
    writeClcrSession(value) { renalWrites.push(clone(value)); renal = clone(value); return true; },
  };
  if (!unavailable) persistence.readClcrSession = () => {
    if (readError) throw new Error('Fictional unavailable draft');
    return clone(renal);
  };
  const win = {
    document: {
      readyState: 'loading',
      getElementById: id => id === 'intakePal' && intakeDom ? { id, value: '' } : values[id] || null,
      querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, dispatchEvent() {},
    },
    VildaPersistence: persistence,
    VildaClcrSessionRuntime: { restoreFromSession: value => restored.push(clone(value)), clearVersionValueVault: clearVersionCache },
    vildaPersistFlushNow: () => lifecycle.push({ type: 'flush', versionCache: clone(versionCache) }),
    sessionStorage: { getItem: key => key === 'vildaCurrentPatientId' ? (Object.prototype.hasOwnProperty.call(options, 'patientId') ? options.patientId : 'fictional-current-patient') : null,
      setItem() {}, removeItem() {} },
    location: { pathname: intakeDom ? '/index.html' : '/kalkulator-klirens.html' },
    setTimeout: () => 0, clearTimeout() {}, addEventListener() {}, dispatchEvent() {},
    Event: class { constructor(type) { this.type = type; } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
  };
  loadBrowserScript('vilda_data_import_export.js', win);
  // Complete the real no-session startup before exercising ordinary draft
  // writes. Gp_k correctly protects an unconsumed startup snapshot otherwise.
  main = null;
  win.VildaDataImportExport.restoreMainSessionIfAny();
  main = clone(PAYLOAD);
  return { win, api: win.VildaDataImportExport, mainWrites, renalWrites, restored, lifecycle, clearVersionCache,
    versionCache: () => clone(versionCache),
    renal: () => renal, main: () => main,
    save() {
      // As on a page without the intake table: the ordinary collector leaves
      // fields belonging to that other page empty and the merge preserves them.
      return win.VildaDataImportExport.saveMainSessionNow({ force: true,
        collectUserData: () => ({ version: 1, name: PAYLOAD.name, user: clone(PAYLOAD.user),
          intake: { pal: null, history: null }, clcr: clone(current) }) });
    },
    restore(payload = clone(PAYLOAD), options = {}) {
      return win.VildaDataImportExport.applyLoadedData(payload, {
        isSessionRestore: true, syncSharedUserDataFromLoadedData() {}, ...options,
      });
    },
  };
}

describe('current Klirens draft remains authoritative over an older nested main snapshot', () => {
  it('does not refill deliberately cleared values, flags, preserved inputs or summaries', () => {
    const h = environment();
    expect(h.save()).toBe(true);
    expect(h.main().clcr).toEqual(CURRENT_RENAL);
    expect(h.main().intake).toEqual(PAYLOAD.intake);
    expect(h.renal()).toEqual(CURRENT_RENAL);
    expect(h.renalWrites).toEqual([]);
  });

  it.each([null, {}, { inputs: {} }])('preserves an explicitly empty dedicated draft %j', current => {
    const h = environment({ current });
    expect(h.save()).toBe(true);
    expect(h.main().clcr).toEqual(current);
  });

  it('keeps a nonzero new value and a legitimate zero without merging earlier fields back in', () => {
    const current = { inputs: { Scr: '1.2', U_Alb: '0' }, preservedInputs: {} };
    const h = environment({ current });
    expect(h.save()).toBe(true);
    expect(h.main().clcr).toEqual(current);
  });

  it.each([{ unavailable: true }, { readError: true }])('retains the legacy preservation path when renal storage is unavailable: %j', options => {
    const h = environment({ ...options, current: null });
    expect(h.save()).toBe(true);
    expect(h.main().clcr).toEqual(OLD_RENAL);
  });

  it('the main-session restore cannot overwrite a newer cleared renal draft', () => {
    const h = environment();
    const incoming = clone(PAYLOAD);
    expect(h.restore(incoming)).toBe(true);
    expect(h.renalWrites).toEqual([CURRENT_RENAL]);
    expect(h.restored).toEqual([CURRENT_RENAL]);
    expect(incoming).toEqual(PAYLOAD);
  });

  it('preserves newer nonempty inputs during main-session restoration as well', () => {
    const current = { inputs: { Scr: '1.1', U_Alb: '0' } };
    const h = environment({ current });
    expect(h.restore()).toBe(true);
    expect(h.renalWrites).toEqual([current]);
  });

  it.each([null, undefined])('a legacy main-only renal form still restores when there is no dedicated draft: %j', current => {
    const h = environment({ current, unavailable: current === undefined });
    expect(h.restore()).toBe(true);
    expect(h.renalWrites).toEqual([OLD_RENAL]);
  });

  it('an explicit patient/file import still replaces the renal draft with the requested record', () => {
    const h = environment();
    expect(h.restore(clone(PAYLOAD), { isSessionRestore: false })).toBe(true);
    expect(h.renalWrites).toEqual([OLD_RENAL]);
  });

  it('the adapter option retains the existing window callback receiver', () => {
    const h = environment();
    expect(h.restore(clone(PAYLOAD), { getVildaPersistenceAdapter() {
      expect(this).toBe(h.win);
      return this.VildaPersistence;
    } })).toBe(true);
    expect(h.renalWrites).toEqual([CURRENT_RENAL]);
  });

  it('the separate explicit Restore saved state flow still applies the selected saved renal form', () => {
    const h = environment();
    h.api.restoreLoadedState({ data: clone(PAYLOAD), anyDataEntered: () => false });
    expect(h.renalWrites).toEqual([OLD_RENAL]);
    expect(h.restored).toEqual([OLD_RENAL]);
  });
});

describe('a confirmed empty renal handoff also invalidates the old local formula cache', () => {
  it('clears the old anonymous context before restore can flush it back into the current session', () => {
    const h = environment({ current: null });
    const incoming = { ...clone(PAYLOAD), clcr: null };
    expect(h.versionCache()).toEqual({ age: '15', U_Alb: '45', Ucr_spot: '100' });
    expect(h.restore(incoming)).toBe(true);
    expect(h.lifecycle[0]).toEqual({ type: 'clear-version-cache' });
    expect(h.lifecycle.filter(event => event.type === 'flush')).not.toHaveLength(0);
    for (const event of h.lifecycle.filter(item => item.type === 'flush')) expect(event.versionCache).toEqual({});
    expect(h.versionCache()).toEqual({});
    expect(h.renal()).toBeNull();
    expect(h.renalWrites).toEqual([]);
    expect(incoming).toEqual({ ...PAYLOAD, clcr: null });
  });

  it.each([
    ['current pending specimen', { current: CURRENT_RENAL }, { clcr: null }, {}],
    ['missing legacy clcr section', { current: null }, {}, {}],
    ['undefined dedicated session', { current: undefined }, { clcr: null }, {}],
    ['unavailable dedicated reader', { current: null, unavailable: true }, { clcr: null }, {}],
    ['failed dedicated read', { current: null, readError: true }, { clcr: null }, {}],
    ['explicit patient load', { current: null }, { clcr: null }, { isSessionRestore: false }],
  ])('%s does not infer authorization to clear the local formula cache', (_label, options, renalSection, restoreOptions) => {
    const h = environment(options), incoming = clone(PAYLOAD), before = h.versionCache();
    delete incoming.clcr;
    Object.assign(incoming, renalSection);
    expect(h.restore(incoming, restoreOptions)).toBe(true);
    expect(h.lifecycle.filter(event => event.type === 'clear-version-cache')).toEqual([]);
    expect(h.versionCache()).toEqual(before);
  });

  it('retains the existing global controller fallback on a mixed runtime version', () => {
    const h = environment({ current: null });
    delete h.win.VildaClcrSessionRuntime.clearVersionValueVault;
    h.win.clcrClearVersionValueVault = h.clearVersionCache;
    expect(h.restore({ ...clone(PAYLOAD), clcr: null })).toBe(true);
    expect(h.lifecycle[0]).toEqual({ type: 'clear-version-cache' });
    expect(h.versionCache()).toEqual({});
  });
});

describe('working Klirens restore keeps the current shared patient context', () => {
  const draft = () => ({ version: 2, currentVersion: 'basic', selectedFormula: '',
    inputs: { fullName: PAYLOAD.name, age: '13', ageMonths: '0', ageDays: '', sex: 'M', weight: '46', height: '158', U_Alb: '', Ucr_spot: '' },
    preservedInputs: { fullName: PAYLOAD.name, age: '13', ageMonths: '0', ageDays: '', weight: '46', U_Alb: '' },
    summary: { clcr: [{ text: 'Powierzchnia ciała (Haycock) 1.42 m²', isOut: false }], elec: [], stone: [], ktv: [] } });
  const currentMain = () => ({ ...clone(PAYLOAD), user: { ...clone(PAYLOAD.user), ageMonths: 4, weight: 47 } });

  it('reconciles existing shared controls before the renal runtime can restore an older same-patient visit', () => {
    const renal = draft(), original = clone(renal), incoming = currentMain(), before = clone(incoming);
    const h = environment({ current: renal });
    expect(h.restore(incoming)).toBe(true);
    const expected = clone(original);
    for (const values of [expected.inputs, expected.preservedInputs]) { values.weight = '47'; values.ageMonths = '4'; }
    expect(h.restored).toEqual([expected]);
    expect(h.renalWrites).toEqual([expected]);
    expect(renal).toEqual(original);
    expect(incoming).toEqual(before);
    expect(expected.summary).toEqual(original.summary);
    expect(expected.inputs.ageDays).toBe('');
  });

  it('honors explicit cleared and zero current values without filling absent main fields', () => {
    const renal = draft(), h = environment({ current: renal }), incoming = currentMain();
    incoming.user.weight = null; incoming.user.ageMonths = 0; delete incoming.user.height;
    expect(h.restore(incoming)).toBe(true);
    expect(h.restored[0].inputs).toMatchObject({ weight: '', ageMonths: '0', height: '158', U_Alb: '', Ucr_spot: '' });
    expect(h.restored[0].preservedInputs.weight).toBe('');
  });

  it.each([undefined, 1, 3])('leaves the unrecognized renal schema %s unchanged', version => {
    const renal = draft();
    if (version === undefined) delete renal.version;
    else renal.version = version;
    const before = clone(renal), h = environment({ current: renal });
    expect(h.restore(currentMain())).toBe(true);
    expect(h.restored).toEqual([before]);
    expect(h.renalWrites).toEqual([before]);
  });


  it.each(['selected-formula', 'pending-lab', 'zero-lab', 'neonatal-age', 'frozen-context', 'unknown-input', 'unknown-empty-input', 'recorded-result'])(
    'does not borrow shared facts into a %s specimen', kind => {
      const renal = draft();
      if (kind === 'selected-formula') renal.selectedFormula = 'ACR_spot';
      if (kind === 'pending-lab') renal.inputs.U_Alb = '45';
      if (kind === 'zero-lab') renal.inputs.U_Alb = '0';
      if (kind === 'neonatal-age') renal.inputs.ageDays = '12';
      if (kind === 'frozen-context') renal.clinicalContext = { age: 10, measuredAtISO: '2023-06-17' };
      if (kind === 'unknown-input') renal.inputs.futureClinicalContext = 'fictional-unrecognized';
      if (kind === 'unknown-empty-input') renal.inputs.futureClinicalContext = '';
      if (kind === 'recorded-result') renal.summary.clcr = [{ text: 'Fikcyjny zapisany wynik', isOut: false }];
      const before = clone(renal), h = environment({ current: renal });
      expect(h.restore(currentMain())).toBe(true);
      expect(h.restored).toEqual([before]);
      expect(h.renalWrites).toEqual([before]);
      expect(renal).toEqual(before);
    });

  it.each(['no-patient', 'anonymous', 'different-patient', 'legacy-independent', 'explicit-load', 'explicit-restore'])(
  'does not replace %s calculator context', mode => {
    const renal = draft(), options = {};
    if (mode === 'no-patient') options.patientId = null;
    if (mode === 'anonymous') for (const values of [renal.inputs, renal.preservedInputs]) values.fullName = '';
    if (mode === 'different-patient') for (const values of [renal.inputs, renal.preservedInputs]) values.fullName = 'Fikcyjny Inny Pacjent';
    if (mode === 'legacy-independent') renal.inputs.samePatientMode = false;
    const h = environment({ ...options, current: renal }), incoming = { ...currentMain(), clcr: clone(renal) };
    if (mode === 'explicit-restore') h.api.restoreLoadedState({ data: incoming, anyDataEntered: () => false });
    else expect(h.restore(incoming, { isSessionRestore: mode !== 'explicit-load' })).toBe(true);
    expect(h.restored).toEqual([renal]);
    expect(h.renalWrites).toEqual([renal]);
  });
});
