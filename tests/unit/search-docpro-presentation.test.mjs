import fs from 'node:fs';
import { parse } from 'espree';
import { afterEach, describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// The control-visit writer is private to the production GH card. Extract its
// actual declarations, including the existing dose formatter; never duplicate
// its note payload or its daily/weekly/Increlex formatting in this test.
const source = fs.readFileSync(new URL('../../gh_igf_therapy.js', import.meta.url), 'utf8');
const tree = parse(source, { ecmaVersion: 'latest', range: true });
const required = new Set(['Q', 'Gdm', 'Gdpod', 'Gdtzp', 'Gdtz', 'ot']);
const declarations = new Map();
function visit(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'FunctionDeclaration' && required.has(node.id?.name)) declarations.set(node.id.name, source.slice(...node.range));
  for (const [key, value] of Object.entries(node)) {
    if (key === 'range') continue;
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') visit(value);
  }
}
visit(tree);
const devices = [];
const storage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key), key: index => [...values.keys()][index] ?? null, get length() { return values.size; } };
};
async function device(payload = {}) {
  const document = new EventTarget(); document.hidden = false;
  const win = { crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa, atob, document, setTimeout, clearTimeout,
    localStorage: storage(), sessionStorage: storage(), addEventListener() {}, removeEventListener() {} };
  win.window = win; win.self = win; win.top = win;
  for (const file of ['vilda_crypto.js', 'vilda_vault.js', 'vilda_gh_dawka_dane.js', 'vilda_gh_dawka.js', 'vilda_global_search.js']) loadBrowserScript(file, win);
  const vault = win.VildaVault; vault.setEphemeralMode(true); vault.setStorageAdapter(vault.createInMemoryAdapter());
  await vault.createUser('Fikcyjny#SearchDocPro!2026', { iterations: 10000, label: 'Fikcyjny audyt producentów DocPro' });
  const saved = await vault.savePatient({ name: 'Fikcyjny Pacjent DocPro', user: { age: 10, sex: 'M', height: 130, weight: 24.7 }, ...payload });
  const writeControl = new Function('window', [...required].map(name => declarations.get(name) || (() => { throw new Error('Missing production writer dependency: ' + name); })()).join('\n') + '\nreturn ot;')(win);
  const search = win.VildaGlobalSearch.create({ vault, document });
  const result = { vault, search, patientId: saved.patientId, writeControl }; devices.push(result); return result;
}
afterEach(() => { for (const item of devices.splice(0)) { item.search.destroy(); item.vault.lock('fictional-docpro-fixture-finished'); } });

const base = { program: 'SNP', programLabel: 'SNP — fikcyjny przykład', drug: 'Omnitrope 10 mg',
  mgKgDay: 0.7 / 24.7, mgDay: 0.7, weight: 24.7, height: 130, ageMonths: 120,
  ghPointId: 'fictional-control-daily', pointType: 'continue', doseUnit: 'mg/kg/d' };

describe('Search reads the actual DocPro GH control-visit writer', () => {
  it.each([
    ['daily rhGH', base, 'Dawka: 0,028 mg/kg/d (0,70 mg/d).'],
    ['weekly rhGH', { ...base, drug: 'Ngenla 60 mg', mgKgDay: 0.66, mgDay: 16.302 / 7,
      ghPointId: 'fictional-control-weekly', doseUnit: 'mg/kg/tydz' }, 'Dawka: 16,3 mg/tydz (0,660 mg/kg/tydz).'],
    ['Increlex / IGF-1', { ...base, drug: 'Increlex 40 mg', program: 'IGF-1', programLabel: 'IGF-1 — fikcyjny przykład', mgKgDay: 0.24, mgDay: 4.8,
      ghPointId: 'fictional-control-igf', pointType: 'end' }, 'Dawka: 2 × 2,4 mg na dobę (0,12 mg/kg na podanie).'],
  ])('keeps the saved %s dose once without rebuilding it from doseNum', async (_label, context, expectedDose) => {
    const d = await device();
    const saved = await d.writeControl(d.patientId, '2027-01-15', '10:30', 20, context);
    const note = await d.vault.getPatientNote(saved.id);
    expect(note.body).toContain(expectedDose);
    expect(note.medication.doseNum).toBe(context.mgKgDay);
    expect(note.ghPointId).toBe(context.ghPointId);
    const rows = await d.search.search(context.drug);
    expect(rows).toHaveLength(1);
    expect(rows[0].noteId).toBe(saved.id);
    expect(rows[0].body).toBe(note.body);
    expect(rows[0].body.match(/^Dawka:/gm)).toHaveLength(1);
    expect(rows[0].body).not.toContain('Leczenie:');
    expect(rows[0].body).not.toContain('mg/kg/d dzień');
    expect(rows[0].body).not.toContain('mg/kg/tydz tydzień');
  });

  it('does not confuse virtual GH/obesity timeline projections with stored searchable patient notes', async () => {
    const d = await device({
      ghTherapyPoints: [{ id: 'fictional-point-gh', type: 'start', ageYears: 9, ageMonths: 0, weight: 24.7,
        height: 128, drug: 'Omnitrope 10 mg', program: 'SNP', dose: 0.7 / 24.7, doseAbs: 0.7, doseUnit: 'mg/kg/d' }],
      obesityTherapyPoints: [{ id: 'fictional-point-obesity', type: 'start', ageYears: 9, ageMonths: 0,
        weight: 40, height: 128, drug: 'Wegovy', substance: 'semaglutyd', dose: '0,5 mg', dateISO: '2026-01-15' }],
    });
    const history = await d.vault.listPatientTimelineEvents(d.patientId);
    expect(history.filter(row => row._ghFromPoint)).toHaveLength(1);
    expect(history.filter(row => row._obFromPoint)).toHaveLength(1);
    expect(history.filter(row => row._ghFromPoint || row._obFromPoint).every(row => row.noteId === null)).toBe(true);
    expect(await d.vault.listAllPatientNotes()).toEqual([]);
    expect(await d.search.search('Omnitrope')).toEqual([]);
    expect(await d.search.search('Wegovy')).toEqual([]);
  });
});
