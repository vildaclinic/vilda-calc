import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const require = createRequire(import.meta.url);
const { parse } = require('espree');
const source = fs.readFileSync(new URL('../../vilda_auth_ui.js', import.meta.url), 'utf8');
const ast = parse(source, { ecmaVersion: 'latest' });
function visit(node, callback) {
  if (!node || typeof node !== 'object') return;
  callback(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => visit(child, callback));
    else if (value && typeof value === 'object') visit(value, callback);
  }
}
function productionFunction(name) {
  const matches = [];
  visit(ast, node => {
    if (node.type === 'FunctionDeclaration' && node.id?.name === name) matches.push(source.slice(node.start, node.end));
  });
  if (matches.length !== 1) throw Error(`${name}: expected one production function, found ${matches.length}`);
  return matches[0];
}
const storage = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key), key: index => [...data.keys()][index] ?? null, get length() { return data.size; } };
};
const noteIds = groups => groups.flatMap(group => group.notes.map(note => note.id)).sort();
let vault, notes;

async function fictionalVault() {
  const win = { crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
    localStorage: storage(), sessionStorage: storage(), setTimeout, clearTimeout, addEventListener() {}, removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false } };
  win.window = win; win.self = win; win.top = win;
  for (const file of ['vilda_crypto.js', 'vilda_vault.js']) loadBrowserScript(file, win);
  const result = win.VildaVault;
  result.setStorageAdapter(result.createInMemoryAdapter());
  await result.createUser('Fikcyjny#RemindersA7!2026', { iterations: 10000, label: 'Fikcyjny sejf reguł przypomnień' });
  return result;
}

function surface(name) {
  let rendered;
  const errors = [], host = { isConnected: true, setAttribute() {}, removeAttribute() {} };
  const owner = { vault }, state = { sequence: 0, owner: null };
  const context = vm.createContext({
    i: { VildaChrome: { refreshRemindersBtn() {} } }, jt: () => vault,
    remReadOwner: () => owner, remReadCurrent: candidate => candidate === owner && vault.isUnlocked(),
    remInlineAllowed: () => true, remInlineState: () => state, remBadgeRecover() {},
    remB22Inline: (_host, groups) => { rendered = groups; },
    remB22Open() {}, Mr: groups => { rendered = groups; },
    remMaybeForced: null, remMaybeReadSequence: 0, Fa: () => '2026-10-28', wn() {},
    Ot: (_label, error) => errors.push(error), remInlineError() {}, remShowReadError() {},
  });
  vm.runInContext(productionFunction(name), context);
  return { run: () => name === 'Br' ? context.Br(host) : context.tn({ force: true }),
    groups: () => rendered, errors };
}

describe('A7 reminder eligibility returns to the pre-B2.2 daily boundary', () => {
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 28, 12, 0, 0));
    vault = await fictionalVault();
    const patient = await vault.savePatient({ name: 'Fikcyjna Zofia A7' });
    const patientId = patient.patientId || patient.id;
    notes = {};
    async function save(key, category, dueDateISO, extra = {}) {
      notes[key] = (await vault.savePatientNote({ patientId, title: 'Fikcyjne A7 ' + key, body: '', category, dueDateISO, ...extra })).id;
    }
    await save('overdue', 'followup', '2026-10-20');
    await save('today', 'followup', '2026-10-28', { dueTime: '20:00' });
    await save('future', 'followup', '2026-10-29');
    await save('pendingOverdue', 'wynik-badania', '2026-10-24');
    await save('pendingToday', 'wynik-badania', '2026-10-28', { dueTime: '23:50' });
    await save('pendingFuture', 'wynik-badania', '2026-11-02');
    await save('external', 'observation', '2026-10-27', { patientId: vault.EXTERNAL_PATIENT_ID, externalName: 'Fikcyjny Jan spoza bazy A7' });
    await save('lecturePast', 'lecture', '2026-10-10', { patientId: vault.ACTIVITY_PATIENT_ID, externalName: 'Fikcyjna sala A7' });
    await save('lectureToday', 'lecture', '2026-10-28', { patientId: vault.ACTIVITY_PATIENT_ID, externalName: 'Fikcyjna sala A7' });
    await save('reservation', 'reservation', '2026-10-28', { patientId: vault.ACTIVITY_PATIENT_ID, externalName: 'Fikcyjna rezerwacja A7' });
    await save('lectureFuture', 'lecture', '2026-11-02', { patientId: vault.ACTIVITY_PATIENT_ID, externalName: 'Fikcyjna sala A7' });
    await save('absence', 'absence', '2026-10-28', { patientId: vault.ACTIVITY_PATIENT_ID });
    await save('oldDuty', 'duty', '2026-10-27', { patientId: vault.ACTIVITY_PATIENT_ID });
    await save('endedClinic', 'clinic', '2026-10-28', { patientId: vault.ACTIVITY_PATIENT_ID, dueTime: '08:00', durationMin: 60 });
    await save('activeDuty', 'duty', '2026-10-28', { patientId: vault.ACTIVITY_PATIENT_ID, dueTime: '11:30', durationMin: 90 });
    await save('done', 'followup', '2026-10-20'); await vault.completePatientNote(notes.done);
    await save('noShow', 'followup', '2026-10-20'); await vault.noShowPatientNote(notes.noShow);
    await save('noDate', 'observation', null);
    await save('missingPatient', 'followup', '2026-10-20', { patientId: 'fictional-missing-patient-a7' });
  });
  afterAll(() => { vault?.lock('manual'); vi.useRealTimers(); });

  const allowedKeys = ['overdue', 'today', 'pendingOverdue', 'pendingToday', 'external', 'lecturePast', 'lectureToday', 'reservation', 'activeDuty'];
  const allowed = () => allowedKeys.map(key => notes[key]).sort();

  it('uses the real native vault rules, preserving due calendar entries and external patients', async () => {
    const groups = await vault.listPatientNotesDueByDate();
    expect(noteIds(groups)).toEqual(allowed());
    expect(groups.some(group => group.isExternal && group.notes.some(note => note.id === notes.external))).toBe(true);
    expect(groups.some(group => group.isActivity && group.notes.some(note => note.id === notes.lectureToday))).toBe(true);
    // The future and closed records still exist; only their active reminder eligibility changes.
    const all = await vault.listAllPatientNotes();
    for (const key of ['future', 'pendingFuture', 'lectureFuture', 'done', 'noShow']) expect(all.some(note => note.id === notes[key])).toBe(true);
    expect((await vault.getPatientNote(notes.done)).completedAtISO).toBeTruthy();
    expect((await vault.getPatientNote(notes.noShow)).noShowAtISO).toBeTruthy();
  });

  it.each(['Br', 'tn'])('%s renders only the native daily groups rather than querying every future event', async name => {
    const ui = surface(name);
    await ui.run();
    expect(ui.errors).toEqual([]);
    expect(noteIds(ui.groups())).toEqual(allowed());
    const all = noteIds(ui.groups());
    for (const key of ['future', 'pendingFuture', 'lectureFuture']) expect(all).not.toContain(notes[key]);
  });

  it('all auth reminder reads, including workspace refresh, retain the native default cutoff', () => {
    const reads = [];
    visit(ast, node => {
      if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && node.callee.property.name === 'listPatientNotesDueByDate') reads.push(node);
    });
    expect(reads.length).toBeGreaterThanOrEqual(4);
    expect(reads.map(read => source.slice(read.start, read.end))).toEqual(reads.map(read => source.slice(read.callee.start, read.callee.end) + '()'));
  });
});
