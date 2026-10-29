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

function environment({ current = CURRENT_RENAL, unavailable = false, readError = false, intakeDom = false } = {}) {
  let main = clone(PAYLOAD), renal = clone(current);
  const mainWrites = [], renalWrites = [], restored = [];
  const values = Object.fromEntries(['name', 'age', 'ageMonths', 'sex', 'height', 'weight']
    .map(id => [id, { id, value: '', style: {}, dataset: {}, addEventListener() {},
      dispatchEvent() {}, classList: { add() {}, remove() {}, contains: () => false } }]));
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
    VildaClcrSessionRuntime: { restoreFromSession: value => restored.push(clone(value)) },
    sessionStorage: { getItem: key => key === 'vildaCurrentPatientId' ? 'fictional-current-patient' : null,
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
  return { win, api: win.VildaDataImportExport, mainWrites, renalWrites, restored,
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
