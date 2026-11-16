import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function editor() {
  const events = new Map(); let sequence = 7, patientId = null;
  const w = { __VILDA_HOME_WORKSPACE_PREVIEW__: true,
    document: { readyState: 'loading', addEventListener() {} },
    VildaDataImportExport: { getApplyLoadedDataSequence: () => sequence },
    sessionStorage: { getItem: () => patientId },
    addEventListener(name, callback) { events.set(name, callback); } };
  loadBrowserScript('vilda_home_perinatal.js', w);
  return { w, events, allow: () => w.VildaHomePerinatal.allowsStartupBirthRestore(),
    load: () => { sequence++; }, select: () => { patientId = 'fictional-next'; } };
}

describe('perinatal untouched startup consent', () => {
  it('is one-time and does not initialize or write a birth record', () => {
    const h = editor(); expect(h.allow()).toBe(true); expect(h.allow()).toBe(false);
    expect(h.w.vildaBirthData).toBeUndefined();
  });
  it.each(['input', 'change', 'vilda:user-state-cleared'])('is retired by %s', name => {
    const h = editor(); h.events.get(name)({ isTrusted: true }); expect(h.allow()).toBe(false);
  });
  it('ignores synthetic initialization but rejects load and patient changes', () => {
    const a = editor(); a.events.get('input')({ isTrusted: false }); expect(a.allow()).toBe(true);
    const b = editor(); b.load(); expect(b.allow()).toBe(false);
    const c = editor(); c.select(); expect(c.allow()).toBe(false);
  });
  it.each([null, { weight: 'fictional-existing' }])('never refills an initialized birth carry %s', birth => {
    const h = editor(); h.w.vildaBirthData = birth; expect(h.allow()).toBe(false); expect(h.w.vildaBirthData).toEqual(birth);
  });
});

const source = fs.readFileSync(new URL('../../vilda_data_import_export.js', import.meta.url), 'utf8');
const realFunctions = source.slice(source.indexOf('function currentMainRestoreFormBasis('), source.indexOf('function Fe('));
const identityFunctions = source.slice(source.indexOf('function Gt_tozsamosc('), source.indexOf('function Gt_obcaSesja('))
  + source.slice(source.indexOf('function compatibleMainSessionIdentity('), source.indexOf('// Legacy exports can predate PAL fields.'));
const clone = value => JSON.parse(JSON.stringify(value));
function restore() {
  const payload = { version: 1, name: 'FIKCYJNY Pacjent', user: { sex: 'M', age: 13, ageMonths: 0, height: 158, weight: 49 },
    birth: { weeks: '34', days: '2', weight: '1800', hasComputed: false } };
  let current = clone(payload); delete current.birth;
  let session = clone(payload), valid = true, patientId = null;
  const allow = vi.fn(() => true), r = { __VILDA_HOME_WORKSPACE_PREVIEW__: true, VildaHomePerinatal: { allowsStartupBirthRestore: allow } };
  const origin = { payloadJSON: JSON.stringify(payload), adapter: { readMainSession: () => session } };
  const context = vm.createContext({ r, CURRENT_USER_READONLY_CAPTURE: Symbol('readonly'),
    Ee: () => clone(current), nativeRestoreCarrySourceCurrent: () => valid,
    mainSessionPatientId: () => patientId,
    N: value => Number(String(value).replace(',', '.')), de: clone, l: vi.fn() });
  vm.runInContext(identityFunctions + realFunctions + '\nthis.restoreBirth = restoreHomeStartupBirth;', context);
  return { r, payload, current, allow, run: () => context.restoreBirth(payload, origin, {}),
    resetSource: () => { session = clone(payload); origin.payloadJSON = JSON.stringify(payload); },
    changeSession: () => { session = { ...session, timestampISO: 'fictional-newer-session' }; },
    switchOwner: () => { valid = false; }, selectPatient: () => { patientId = 'fictional-next'; } };
}

describe('real native kept-form birth recovery', () => {
  it('recovers a detached exact birth record without replacing form data', () => {
    const h = restore(), before = clone(h.current); expect(h.run()).toBe(true);
    expect(h.r.vildaBirthData).toEqual(h.payload.birth); expect(h.r.vildaBirthData).not.toBe(h.payload.birth);
    expect(h.current).toEqual(before);
  });
  it('recovers the same untouched anonymous working measurement without requiring a name', () => {
    const h = restore(); h.payload.name = ''; h.current.name = '';
    // Source provenance must describe the actual anonymous session too.
    h.resetSource();
    expect(h.run()).toBe(true); expect(h.r.vildaBirthData).toEqual(h.payload.birth);
  });
  it.each(['sex', 'age', 'ageMonths', 'height', 'weight', 'dobISO'])('rejects conflicting %s', key => {
    const h = restore(); h.current.user[key] = key === 'sex' ? 'F' : key === 'dobISO' ? '2013-01-01' : 99;
    expect(h.run()).toBe(false); expect(h.r.vildaBirthData).toBeUndefined();
  });
  it('rejects another person, a changed source, selected patient or consumed startup', () => {
    const a = restore(); a.current.name = 'FIKCYJNA Inna'; expect(a.run()).toBe(false);
    const b = restore(); b.changeSession(); expect(b.run()).toBe(false);
    const c = restore(); c.selectPatient(); expect(c.run()).toBe(false);
    const d = restore(); d.allow.mockReturnValue(false); expect(d.run()).toBe(false);
  });
  it('checks owner authority again after the editor callback', () => {
    const h = restore(); h.allow.mockImplementation(() => { h.switchOwner(); return true; });
    expect(h.run()).toBe(false); expect(h.r.vildaBirthData).toBeUndefined();
  });
  it.each([null, { weight: 'fictional-existing' }])('does not replace initialized state %s', birth => {
    const h = restore(); h.r.vildaBirthData = birth; expect(h.run()).toBe(false); expect(h.r.vildaBirthData).toEqual(birth);
  });
  it('does not touch the ordinary application', () => {
    const h = restore(); h.r.__VILDA_HOME_WORKSPACE_PREVIEW__ = false;
    expect(h.run()).toBe(false); expect(h.allow).not.toHaveBeenCalled(); expect(h.r.vildaBirthData).toBeUndefined();
  });
});
