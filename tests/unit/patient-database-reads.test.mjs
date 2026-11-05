import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Real production vault and WebCrypto over an in-memory adapter. These names,
// accounts and treatment entries are exclusively fictional test data.
const devices = [];
let serial = 0;
function storage() {
  const entries = new Map();
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, String(value)),
    removeItem: key => entries.delete(key), key: index => [...entries.keys()][index] ?? null,
    get length() { return entries.size; } };
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
async function device() {
  const win = { crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa, atob,
    localStorage: storage(), sessionStorage: storage(), setTimeout, clearTimeout,
    addEventListener() {}, removeEventListener() {}, document: { hidden: false, addEventListener() {}, removeEventListener() {} } };
  win.window = win; win.self = win; win.top = win;
  loadBrowserScript('vilda_crypto.js', win); loadBrowserScript('vilda_vault.js', win);
  const vault = win.VildaVault, adapter = vault.createInMemoryAdapter();
  vault.setStorageAdapter(adapter);
  const password = 'Fikcyjny#PatientDatabase!2026-' + ++serial;
  await vault.createUser(password, { iterations: 10000, label: 'Fikcyjny sejf Bazy pacjentów' });
  const env = { win, vault, adapter, password, account: vault.getCurrentUser().userId, readers: [] };
  devices.push(env);
  return env;
}
function reader(env, options) {
  const result = env.vault.createPatientListReader(options);
  env.readers.push(result);
  return result;
}
async function patient(env, name, extra = {}) {
  return (await env.vault.savePatient({ name: 'Fikcyjny ' + name,
    user: { age: 12, ageMonths: 0, sex: 'F', height: 140, weight: 35, dobISO: '2014-01-15' }, ...extra,
  }, { dedup: false })).patientId;
}
async function note(env, patientId, action, date, extra = {}) {
  return env.vault.savePatientNote({ patientId, title: 'Fikcyjny wpis leczenia', category: 'treatment',
    clinicalDateISO: date, medication: { name: 'Fikcyjny lek', action }, ...extra });
}
function corrupt(cipher) {
  const bytes = Buffer.from(cipher.data, 'base64'); bytes[bytes.length - 1] ^= 1;
  return { ...cipher, data: bytes.toString('base64') };
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const env of devices.splice(0)) {
    env.readers.forEach(context => context.dispose());
    env.vault.lock('manual');
  }
});

describe('Patient Database reads only the required encrypted sources', () => {
  it('returns both unchanged partitions in one read and never reads snapshots or writes data', async () => {
    const env = await device();
    await patient(env, 'A'); await patient(env, 'B');
    await env.vault.saveExternalPatient({ name: 'Fikcyjna osoba zewnętrzna', birthYear: 2010 });
    const expected = [...await env.vault.listPatients(), ...await env.vault.listExternalPatients()];
    const read = vi.spyOn(env.adapter, 'listPatientsForUser');
    const decrypt = vi.spyOn(env.win.VildaCrypto, 'decryptString');
    const forbidden = ['listSnapshotsForUser', 'putPatientForUser', 'putSnapshotForUser'].map(method => vi.spyOn(env.adapter, method));
    const actual = await env.vault.listPatientDirectory();
    expect(actual.slice().sort((a, b) => a.patientId.localeCompare(b.patientId)))
      .toEqual(expected.sort((a, b) => a.patientId.localeCompare(b.patientId)));
    expect(read).toHaveBeenCalledTimes(1); expect(decrypt).toHaveBeenCalledTimes(3);
    forbidden.forEach(spy => expect(spy).not.toHaveBeenCalled());
  });

  it('rejects a corrupt directory header while preserving legacy non-strict placeholders', async () => {
    const env = await device(), id = await patient(env, 'Uszkodzony szyfr');
    const record = await env.adapter.getPatientForUser(env.account, id);
    await env.adapter.putPatientForUser(env.account, { ...record, headerCipher: corrupt(record.headerCipher) });
    await expect(env.vault.listPatientDirectory()).rejects.toMatchObject({ name: 'OperationError' });
    expect((await env.vault.listPatients())[0].header.name).toBe('(błąd odczytu)');
  });

  it('decrypts only legacy external notes and preserves the prior count, sort and chosen name spelling', async () => {
    const env = await device(), id = await patient(env, 'Notatki');
    await note(env, id, 'start', '2026-01-01');
    await note(env, id, 'stop', '2026-02-01');
    for (const [externalName, dueDateISO] of [['Fikcyjna Anna', '2026-11-01'], ['FIKCYJNA ANNA', '2026-10-01'], [' Fikcyjny Zenon ', '2026-09-01']]) {
      await env.vault.savePatientNote({ patientId: env.vault.EXTERNAL_PATIENT_ID, title: 'Fikcyjny starszy wpis', externalName, dueDateISO });
    }
    const decrypt = vi.spyOn(env.win.VildaCrypto, 'decryptString');
    const read = vi.spyOn(env.adapter, 'listPatientNotesForUser');
    expect(await env.vault.legacyExternalSummary({ strict: true })).toEqual({ count: 3, names: ['FIKCYJNA ANNA', 'Fikcyjny Zenon'] });
    expect(read).toHaveBeenCalledTimes(1); expect(decrypt).toHaveBeenCalledTimes(3);
    expect(await env.vault.countLegacyExternalNotes()).toBe(3);
    expect(await env.vault.legacyExternalSummary()).toEqual({ count: 3, names: ['FIKCYJNA ANNA', 'Fikcyjny Zenon'] });
  });

  it('refuses strict legacy-summary reads when locked while retaining the old empty non-strict result', async () => {
    const env = await device();
    env.vault.lock('manual');
    const read = vi.spyOn(env.adapter, 'listPatientNotesForUser');
    await expect(env.vault.legacyExternalSummary({ strict: true })).rejects.toMatchObject({ code: 'VAULT_LOCKED' });
    expect(() => reader(env)).toThrowError(/Zaloguj/);
    expect(await env.vault.legacyExternalSummary()).toEqual({ count: 0, names: [] });
    expect(read).not.toHaveBeenCalled();
  });
});

async function ruleFixture(env) {
  const gh = (type, drug, program, ageYears) => ({ type, drug, program, ageYears, ageMonths: 0 });
  const obesity = (type, drug, ageYears, dateISO) => ({ type, drug, ageYears, ageMonths: 0, dateISO });
  const a = await patient(env, 'A', {
    ghTherapyPoints: [gh('start', 'Omnitrope 10 mg', 'SNP', 10), gh('continue', 'Genotropin 12 mg', 'SNP', 11)],
    obesityTherapyPoints: [obesity('start', 'Wegovy', 10, '2025-01-01'), obesity('continue', 'Wegovy', 11, '2025-02-01')],
  });
  const b = await patient(env, 'B', {
    ghTherapyPoints: [gh('start', 'Omnitrope 10 mg', 'SNP', 10), gh('end', 'Omnitrope 10 mg', 'SNP', 11)],
    obesityTherapyPoints: [obesity('start', 'Wegovy', 10, '2025-01-01'), obesity('end', 'Wegovy', 11, '2025-02-01')],
  });
  const c = await patient(env, 'C', {
    ghTherapyPoints: [gh('start', 'Omnitrope 10 mg', 'SNP', 10), gh('continue', 'Genotropin 12 mg', 'SGA', 11)],
    obesityTherapyPoints: [obesity('start', 'Wegovy', 10, '2025-01-01'), obesity('continue', 'Saxenda', 11, '2025-02-01')],
  });
  const d = await patient(env, 'D', {
    ghTherapyPoints: [gh('start', 'Omnitrope 10 mg', 'SNP', 10), gh('continue', 'Omnitrope 15 mg', 'SNP', 11)],
    obesityTherapyPoints: [obesity('start', 'Wegovy', 9, '2025-02-01'), obesity('end', 'Wegovy', 10, '2025-01-01')],
  });
  const e = await patient(env, 'E');
  await note(env, a, 'start', '2026-01-01');
  await note(env, b, 'start', '2026-01-01'); await note(env, b, 'stop', '2026-02-01');
  await note(env, c, 'stop', '2026-01-01');
  await note(env, d, 'start', '2026-01-01');
  await note(env, d, 'stop', '2026-02-01', { medication: { name: 'Fikcyjny inny lek', action: 'stop' } });
  await note(env, e, 'start', '2026-01-01', { ghPointId: 'fictional-gh-point' });
  return { a, b, c, d, e };
}
function cases({ a, b, c, d, e }) {
  return [
    { rule: null, memberIds: [e, b], excludeIds: [b], expected: [e] },
    { rule: { type: 'gh', program: 'SNP', scope: 'active' }, expected: [a, d] },
    { rule: { type: 'gh', program: 'SNP', scope: 'ever' }, expected: [a, b, c, d] },
    { rule: { type: 'gh', program: 'SNP', scope: 'active', changed: true }, expected: [a] },
    { rule: { type: 'gh', program: 'SGA', scope: 'active', changed: true }, expected: [] },
    { rule: { type: 'gh', scope: 'ever', changed: true, fromDrug: 'Omnitrope', toDrug: 'Genotropin' }, expected: [a, c] },
    { rule: { type: 'gh', scope: 'ever', changed: true, fromDrug: 'Genotropin', toDrug: 'Omnitrope' }, expected: [] },
    { rule: { type: 'obesity', drugKey: 'wegovy', scope: 'active' }, expected: [a, d] },
    { rule: { type: 'obesity', drugKey: 'wegovy', scope: 'ever' }, expected: [a, b, c, d] },
    { rule: { type: 'obesity', drugKey: 'saxenda', scope: 'active' }, expected: [c] },
    { rule: { type: 'medication', value: 'Fikcyjny lek', scope: 'active' }, expected: [a, d] },
    { rule: { type: 'medication', value: 'Fikcyjny lek', scope: 'ever' }, expected: [a, b, c, d] },
    { rule: { type: 'medication', value: 'Fikcyjny lek', scope: 'active' }, memberIds: [b, e], excludeIds: [a, e], expected: [d, b], viaRule: { [d]: true } },
  ];
}

describe('Shared list reads keep membership while avoiding repeated decryption', () => {
  it('matches known manual/GH/obesity/medication results and the unchanged public API', async () => {
    const env = await device(), ids = await ruleFixture(env), examples = cases(ids);
    const definitions = [];
    for (const [index, example] of examples.entries()) definitions.push(await env.vault.savePatientList({
      name: 'Fikcyjna lista ' + index, rule: example.rule, memberIds: example.memberIds || [], excludeIds: example.excludeIds || [],
    }));
    const expected = await Promise.all(definitions.map(list => env.vault.getPatientListMembers(list)));
    expected.forEach((value, index) => {
      expect([...value.memberIds].sort(), 'known fixture ' + index).toEqual([...examples[index].expected].sort());
      if (examples[index].viaRule) expect(value.viaRule).toEqual(examples[index].viaRule);
    });
    const reads = ['listPatientListsForUser', 'listPatientsForUser', 'listPatientNotesForUser', 'listSnapshotsForUser']
      .map(method => vi.spyOn(env.adapter, method));
    const decrypt = vi.spyOn(env.win.VildaCrypto, 'decryptString');
    const context = reader(env), catalog = await context.listPatientLists();
    const actual = await Promise.all(definitions.map(list => context.getPatientListMembers(list)));
    expect(actual).toEqual(expected);
    expect(catalog).toEqual(await env.vault.listPatientLists());
    // One read of 7 medication notes and one pass over the 5 latest snapshots,
    // shared by every rule, rather than a new note read for each medication list.
    expect(reads[1]).toHaveBeenCalledTimes(1); expect(reads[2]).toHaveBeenCalledTimes(1); expect(reads[3]).toHaveBeenCalledTimes(5);
    expect(reads[0]).toHaveBeenCalledTimes(2); // reader catalog + explicit compatibility assertion above
    expect(decrypt).toHaveBeenCalledTimes(2 * definitions.length + 7 + 5);
    reads.forEach(spy => spy.mockClear()); decrypt.mockClear();
    expect(await context.getPatientListMembers(definitions[10].id)).toEqual(expected[10]);
    expect(await context.listPatientLists()).toEqual(catalog);
    reads.forEach(spy => expect(spy).not.toHaveBeenCalled()); expect(decrypt).not.toHaveBeenCalled();
    actual[10].memberIds.length = 0;
    expect(await context.getPatientListMembers(definitions[10].id)).toEqual(expected[10]);
  });

  it('does not retain a result after disposal and a new reader sees changed notes and exclusions', async () => {
    const env = await device(), id = await patient(env, 'Zmiana listy');
    await note(env, id, 'start', '2026-01-01');
    const list = await env.vault.savePatientList({ name: 'Fikcyjna lista zmiany', rule: { type: 'medication', value: 'Fikcyjny lek' } });
    const first = reader(env);
    expect((await first.getPatientListMembers(list)).memberIds).toEqual([id]);
    first.dispose();
    await note(env, id, 'stop', '2026-02-01');
    await expect(first.getPatientListMembers(list)).rejects.toMatchObject({ code: 'VAULT_READ_CANCELLED' });
    expect((await reader(env).getPatientListMembers(list)).memberIds).toEqual([]);
    const changed = await env.vault.savePatientList({ ...list, memberIds: [id], excludeIds: [id] });
    expect(await reader(env).getPatientListMembers(changed)).toEqual({ memberIds: [], viaRule: {}, count: 0 });
  });

  it('rejects corrupt automatic-list sources, preserves legacy leniency, and allows retry', async () => {
    const env = await device(), id = await patient(env, 'Uszkodzona notatka');
    const saved = await note(env, id, 'start', '2026-01-01');
    const list = await env.vault.savePatientList({ name: 'Fikcyjna lista odczytu', rule: { type: 'medication', value: 'Fikcyjny lek' } });
    const stored = await env.adapter.getPatientNoteForUser(env.account, saved.id);
    await env.adapter.putPatientNoteForUser(env.account, { ...stored, bodyCipher: corrupt(stored.bodyCipher) });
    const context = reader(env);
    await expect(context.getPatientListMembers(list)).rejects.toMatchObject({ name: 'OperationError' });
    expect((await env.vault.getPatientListMembers(list)).memberIds).toEqual([]); // legacy placeholder is still ignored
    await env.adapter.putPatientNoteForUser(env.account, stored);
    expect((await context.getPatientListMembers(list)).memberIds).toEqual([id]);
  });

  it('does not turn corrupt list definitions or therapy snapshots into zero-member successes', async () => {
    const env = await device(), id = await patient(env, 'Uszkodzony zapis terapii', {
      ghTherapyPoints: [{ type: 'start', drug: 'Omnitrope', program: 'SNP', ageYears: 10, ageMonths: 0 }],
    });
    const list = await env.vault.savePatientList({ name: 'Fikcyjna lista GH', rule: { type: 'gh', program: 'SNP' } });
    const definition = await env.adapter.getPatientListForUser(env.account, list.id);
    await env.adapter.putPatientListForUser(env.account, { ...definition, bodyCipher: corrupt(definition.bodyCipher) });
    const context = reader(env);
    await expect(context.listPatientLists()).rejects.toMatchObject({ name: 'OperationError' });
    expect((await env.vault.listPatientLists())[0].name).toBe('');
    await env.adapter.putPatientListForUser(env.account, definition);
    expect(await context.listPatientLists()).toEqual(await env.vault.listPatientLists());
    const snapshot = (await env.adapter.listSnapshotsForUser(env.account, id))[0];
    await env.adapter.putSnapshotForUser(env.account, { ...snapshot, payloadCipher: corrupt(snapshot.payloadCipher) });
    await expect(context.getPatientListMembers(list)).rejects.toMatchObject({ name: 'OperationError' });
    expect((await env.vault.getPatientListMembers(list)).memberIds).toEqual([]);
    await env.adapter.putSnapshotForUser(env.account, snapshot);
    expect((await context.getPatientListMembers(list)).memberIds).toEqual([id]);
  });

  it('rejects a missing latest snapshot cipher only in the strict reader', async () => {
    const env = await device(), id = await patient(env, 'Brakujący szyfr terapii', {
      ghTherapyPoints: [{ type: 'start', drug: 'Omnitrope', program: 'SNP', ageYears: 10, ageMonths: 0 }],
    });
    const list = await env.vault.savePatientList({ name: 'Fikcyjna lista niepełnego zapisu', rule: { type: 'gh', program: 'SNP' } });
    const snapshot = (await env.adapter.listSnapshotsForUser(env.account, id))[0];
    await env.adapter.putSnapshotForUser(env.account, { ...snapshot, payloadCipher: null });
    await expect(reader(env).getPatientListMembers(list)).rejects.toMatchObject({ code: 'VAULT_READ_INCOMPLETE' });
    expect((await env.vault.getPatientListMembers(list)).memberIds).toEqual([]);
  });
});

describe('Database read contexts stop after session or owner cancellation', () => {
  const operations = [
    { name: 'directory', source: 'listPatientsForUser', read: env => env.vault.listPatientDirectory({ isCurrent: () => env.current }) },
    { name: 'catalog', source: 'listPatientListsForUser', read: env => reader(env, { isCurrent: () => env.current }).listPatientLists() },
    { name: 'medication members', source: 'listPatientNotesForUser', read: env => reader(env, { isCurrent: () => env.current }).getPatientListMembers(env.list) },
    { name: 'therapy members', source: 'listSnapshotsForUser', read: env => reader(env, { isCurrent: () => env.current }).getPatientListMembers({ ...env.list, rule: { type: 'gh', scope: 'active' } }) },
    { name: 'legacy summary', source: 'listPatientNotesForUser', read: env => env.vault.legacyExternalSummary({ strict: true, isCurrent: () => env.current }) },
  ];
  for (const operation of operations) {
    it.each(['owner cancellation', 'lock/unlock'])(`${operation.name}: %s during source delivery stops old-record decryption`, async change => {
      const env = await device(); env.current = true;
      const id = await patient(env, 'Granica sesji'); await note(env, id, 'start', '2026-01-01');
      env.list = await env.vault.savePatientList({ name: 'Fikcyjna lista sesji', rule: { type: 'medication', value: 'Fikcyjny lek' } });
      const entered = deferred(), release = deferred();
      const original = env.adapter[operation.source].bind(env.adapter);
      vi.spyOn(env.adapter, operation.source).mockImplementationOnce(async (...args) => {
        const value = await original(...args); entered.resolve(); await release.promise; return value;
      });
      const pending = operation.read(env).then(value => ({ value }), error => ({ error }));
      await entered.promise;
      if (change === 'owner cancellation') env.current = false;
      else { env.vault.lock('manual'); await env.vault.unlockUser(env.account, env.password); }
      const decrypt = vi.spyOn(env.win.VildaCrypto, 'decryptString');
      release.resolve();
      const result = await pending;
      expect(result.value).toBeUndefined();
      expect(result.error).toMatchObject({ code: change === 'owner cancellation' ? 'VAULT_READ_CANCELLED' : 'SESSION_CHANGED' });
      expect(decrypt).not.toHaveBeenCalled();
    });
    it(`${operation.name}: disposing the owner after real decryption rejects the pending result`, async () => {
      const env = await device(); env.current = true;
      const id = await patient(env, 'Przerwanie po deszyfrowaniu');
      await note(env, id, 'start', '2026-01-01');
      await env.vault.savePatientNote({ patientId: env.vault.EXTERNAL_PATIENT_ID, title: 'Fikcyjny starszy wpis', externalName: 'Fikcyjna osoba' });
      env.list = await env.vault.savePatientList({ name: 'Fikcyjna lista sesji', rule: { type: 'medication', value: 'Fikcyjny lek' } });
      const entered = deferred(), release = deferred();
      const original = env.win.VildaCrypto.decryptString.bind(env.win.VildaCrypto);
      const decrypt = vi.spyOn(env.win.VildaCrypto, 'decryptString').mockImplementationOnce(async (...args) => {
        const value = await original(...args); entered.resolve(); await release.promise; return value;
      });
      const pending = operation.read(env).then(value => ({ value }), error => ({ error }));
      await entered.promise;
      env.current = false;
      release.resolve();
      const result = await pending;
      expect(result.value).toBeUndefined();
      expect(result.error).toMatchObject({ code: 'VAULT_READ_CANCELLED' });
      expect(decrypt).toHaveBeenCalledTimes(1);
    });
  }
});
