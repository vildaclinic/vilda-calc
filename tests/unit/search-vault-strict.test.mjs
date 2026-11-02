import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const devices = [];
let serial = 0;
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key), key: index => [...values.keys()][index] ?? null, get length() { return values.size; } };
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
  const password = 'Fikcyjny#StrictRead!2026-' + ++serial;
  await vault.createUser(password, { iterations: 10000, label: 'Fikcyjny sejf ścisłego odczytu' });
  const account = vault.getCurrentUser().userId;
  const primary = (await vault.savePatient({ name: 'Fikcyjny Pacjent Ścisły', user: { sex: 'M', age: 10, height: 140, weight: 35 } })).patientId;
  const external = (await vault.saveExternalPatient({ firstName: 'Fikcyjna Anna', lastName: 'Zewnętrzna', birthYear: 2010 })).patientId;
  const firstNote = (await vault.savePatientNote({ patientId: primary, title: 'Fikcyjna pierwsza notatka', body: 'Fikcyjna pełna treść.', category: 'observation' })).id;
  const secondNote = (await vault.savePatientNote({ patientId: primary, title: 'Fikcyjna druga notatka', body: 'Fikcyjna druga treść.', category: 'observation' })).id;
  const env = { win, vault, adapter, account, password, primary, external, firstNote, secondNote };
  devices.push(env); return env;
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const env of devices.splice(0)) env.vault.lock('manual');
});

function corruptCipher(cipher) {
  const data = Buffer.from(cipher.data, 'base64');
  expect(data.length).toBeGreaterThan(16);
  data[data.length - 1] ^= 1;
  return { ...cipher, data: data.toString('base64') };
}
const readers = [
  { api: 'listPatients', list: 'listPatientsForUser', cipher: 'headerCipher' },
  { api: 'listExternalPatients', list: 'listPatientsForUser', cipher: 'headerCipher' },
  { api: 'listAllPatientNotes', list: 'listPatientNotesForUser', cipher: 'bodyCipher' },
];

describe('Search strict vault reads use real encrypted records without changing legacy defaults', () => {
  it('keeps the primary/external partition and the exact existing readable records', async () => {
    const env = await device();
    for (const { api } of readers) expect(await env.vault[api]({ strict: true })).toEqual(await env.vault[api]());
    expect((await env.vault.listPatients({ strict: true })).map(row => row.patientId)).toEqual([env.primary]);
    expect((await env.vault.listExternalPatients({ strict: true })).map(row => row.patientId)).toEqual([env.external]);
    expect((await env.vault.listAllPatientNotes({ strict: true })).map(row => row.id).sort()).toEqual([env.firstNote, env.secondNote].sort());
  });

  it.each([
    ['listPatients', 'primary'], ['listPatients', 'external'],
    ['listExternalPatients', 'primary'], ['listExternalPatients', 'external'],
  ])('%s rejects a real corrupt %s header even when that patient belongs to the other partition', async (api, partition) => {
    const env = await device(), patient = env[partition];
    const stored = await env.adapter.getPatientForUser(env.account, patient);
    await env.adapter.putPatientForUser(env.account, { ...stored, headerCipher: corruptCipher(stored.headerCipher) });
    await expect(env.vault[api]({ strict: true })).rejects.toMatchObject({ name: 'OperationError' });
    const legacy = await env.vault.listPatients();
    expect(legacy.find(row => row.patientId === patient).header).toEqual({ name: '(błąd odczytu)', timestampISO: stored.lastSavedAtISO || '' });
    expect((await env.vault.listExternalPatients()).map(row => row.patientId)).toEqual(partition === 'external' ? [] : [env.external]);
  });

  it('rejects a real corrupt note cipher, preserves its legacy placeholder and retries after repairing the fixture without clinical writes', async () => {
    const env = await device();
    const original = await env.adapter.getPatientNoteForUser(env.account, env.firstNote);
    const before = await env.vault.getPatientNote(env.firstNote);
    await env.adapter.putPatientNoteForUser(env.account, { ...original, bodyCipher: corruptCipher(original.bodyCipher) });
    const writes = ['putPatientForUser', 'putSnapshotForUser', 'putPatientNoteForUser'].map(method => vi.spyOn(env.adapter, method));
    await expect(env.vault.listAllPatientNotes({ strict: true })).rejects.toMatchObject({ name: 'OperationError' });
    const legacy = (await env.vault.listAllPatientNotes()).find(note => note.id === env.firstNote);
    expect(legacy).toMatchObject({ id: env.firstNote, title: '(błąd odczytu)', body: '', patientId: env.primary, category: 'observation' });
    expect((await env.vault.listAllPatientNotes({ strict: false })).find(note => note.id === env.firstNote)).toEqual(legacy);
    for (const write of writes) expect(write).not.toHaveBeenCalled();
    await env.adapter.putPatientNoteForUser(env.account, original);
    for (const write of writes) write.mockClear();
    const repaired = (await env.vault.listAllPatientNotes({ strict: true })).find(note => note.id === env.firstNote);
    expect(repaired).toEqual(before);
    expect(await env.adapter.getPatientNoteForUser(env.account, env.firstNote)).toEqual(original);
    for (const write of writes) expect(write).not.toHaveBeenCalled();
  });

  it.each(readers)('$api rejects malformed decrypted JSON rather than treating it as an unreadable clinical snapshot', async ({ api, cipher }) => {
    const env = await device();
    const decrypt = vi.spyOn(env.win.VildaCrypto, 'decryptString');
    await env.vault[api]({ strict: true });
    const key = decrypt.mock.calls[0][0]; decrypt.mockRestore();
    const invalidJson = await env.win.VildaCrypto.encryptString(key, '{fictional-invalid-json');
    if (cipher === 'headerCipher') {
      const stored = await env.adapter.getPatientForUser(env.account, env.primary);
      await env.adapter.putPatientForUser(env.account, { ...stored, headerCipher: invalidJson });
    } else {
      const stored = await env.adapter.getPatientNoteForUser(env.account, env.firstNote);
      await env.adapter.putPatientNoteForUser(env.account, { ...stored, bodyCipher: invalidJson });
    }
    await expect(env.vault[api]({ strict: true })).rejects.toMatchObject({ name: 'SyntaxError' });
    if (cipher === 'headerCipher') expect((await env.vault.listPatients()).find(row => row.patientId === env.primary).header.name).toBe('(błąd odczytu)');
    else expect((await env.vault.listAllPatientNotes()).find(note => note.id === env.firstNote)).toMatchObject({ title: '(błąd odczytu)', body: '' });
  });

  it('accepts legitimate saved placeholder-looking names and titles without guessing a read error from text', async () => {
    const env = await device();
    const patient = await env.vault.savePatient({ name: '(błąd odczytu)', user: { age: 20, sex: 'F' } }, { dedup: false });
    const external = await env.vault.saveExternalPatient({ name: '(błąd odczytu)' });
    const note = await env.vault.savePatientNote({ patientId: patient.patientId, title: '(błąd odczytu)', body: 'Fikcyjna poprawnie zaszyfrowana treść.' });
    expect((await env.vault.listPatients({ strict: true })).find(row => row.patientId === patient.patientId).header.name).toBe('(błąd odczytu)');
    expect((await env.vault.listExternalPatients({ strict: true })).find(row => row.patientId === external.patientId).header.name).toBe('(błąd odczytu)');
    expect((await env.vault.listAllPatientNotes({ strict: true })).find(row => row.id === note.id)).toMatchObject({ title: '(błąd odczytu)', body: 'Fikcyjna poprawnie zaszyfrowana treść.' });
  });

  it('keeps a malformed Klirens envelope as readable clinical content when its actual cipher and JSON are valid', async () => {
    const env = await device();
    const body = '[VILDA_CLCR_CALCULATION_V1]\n{broken\n[/VILDA_CLCR_CALCULATION_V1]';
    const saved = await env.vault.savePatientNote({ patientId: env.primary, title: 'Fikcyjny uszkodzony zapis kalkulacji', body,
      category: 'wynik-klirens', clinicalDateISO: '2026-10-28' });
    const legacy = await env.vault.getPatientNote(saved.id);
    expect((await env.vault.listAllPatientNotes({ strict: true })).find(note => note.id === saved.id)).toEqual(legacy);
    expect(legacy.body).toBe(body);
  });

  it.each(readers)('$api propagates an adapter read failure and permits an unchanged retry', async ({ api, list }) => {
    const env = await device(), expected = await env.vault[api]({ strict: true });
    const failure = new Error('Fikcyjny błąd źródła adaptera');
    vi.spyOn(env.adapter, list).mockRejectedValueOnce(failure);
    await expect(env.vault[api]({ strict: true })).rejects.toBe(failure);
    expect(await env.vault[api]({ strict: true })).toEqual(expected);
  });
});

async function changeSession(env, change) {
  if (change === 'lock/unlock same account') {
    env.vault.lock('manual');
    await env.vault.unlockUser(env.account, env.password);
    expect(env.vault.getCurrentUser().userId).toBe(env.account);
  } else {
    await env.vault.createUser('Fikcyjny#OtherStrict!2026-' + ++serial, { iterations: 10000, label: 'Fikcyjne drugie konto strict' });
    expect(env.vault.getCurrentUser().userId).not.toBe(env.account);
  }
}

describe('Strict reads bind every awaited source and decryption to the original real vault session', () => {
  for (const reader of readers) {
    it.each(['lock/unlock same account', 'account switch'])(`${reader.api}: %s during adapter delivery prevents all subsequent record decryptions`, async change => {
      const env = await device(), entered = deferred(), released = deferred();
      const stored = await env.adapter[reader.list](env.account);
      const oldIvs = new Set(stored.map(record => record[reader.cipher].iv));
      const decrypt = vi.spyOn(env.win.VildaCrypto, 'decryptString');
      const originalList = env.adapter[reader.list].bind(env.adapter);
      const list = vi.spyOn(env.adapter, reader.list).mockImplementationOnce(async (...args) => {
        const rows = await originalList(...args); entered.resolve(); await released.promise; return rows;
      });
      const pending = env.vault[reader.api]({ strict: true }).then(value => ({ value }), error => ({ error }));
      await entered.promise;
      await changeSession(env, change);
      list.mockClear();
      released.resolve();
      const result = await pending;
      expect(result.error).toMatchObject({ code: 'SESSION_CHANGED' });
      expect(result.value).toBeUndefined();
      expect(decrypt.mock.calls.filter(([, iv]) => oldIvs.has(iv))).toHaveLength(0);
      expect(list).not.toHaveBeenCalled();
    });

    it.each(['lock/unlock same account', 'account switch'])(`${reader.api}: %s after actual decryption prevents reading the next record`, async change => {
      const env = await device(), entered = deferred(), released = deferred();
      const stored = await env.adapter[reader.list](env.account);
      expect(stored.length).toBeGreaterThanOrEqual(2);
      const oldIvs = new Set(stored.map(record => record[reader.cipher].iv));
      const originalDecrypt = env.win.VildaCrypto.decryptString.bind(env.win.VildaCrypto);
      const decrypt = vi.spyOn(env.win.VildaCrypto, 'decryptString').mockImplementationOnce(async (...args) => {
        const plaintext = await originalDecrypt(...args); entered.resolve(); await released.promise; return plaintext;
      });
      const list = vi.spyOn(env.adapter, reader.list);
      const pending = env.vault[reader.api]({ strict: true }).then(value => ({ value }), error => ({ error }));
      await entered.promise;
      await changeSession(env, change);
      list.mockClear();
      released.resolve();
      const result = await pending;
      expect(result.error).toMatchObject({ code: 'SESSION_CHANGED' });
      expect(result.value).toBeUndefined();
      expect(decrypt.mock.calls.filter(([, iv]) => oldIvs.has(iv))).toHaveLength(1);
      expect(list).not.toHaveBeenCalled();
    });
  }
});

const cancellableReaders = [...readers, { api: 'listCarePlans', list: 'listPatientNotesForUser', cipher: 'bodyCipher' }];
async function addPlans(env) {
  for (let index = 0; index < 2; index += 1) {
    const result = await env.vault.mutateCarePlan({ action: 'create', patientId: env.primary,
      operationId: 'fictional-strict-plan-' + ++serial, title: 'Fikcyjny plan ścisłego odczytu ' + index, goal: 'Fikcyjny cel planu.' });
    expect(result.saved).toBe(true);
  }
}

describe('Strict generation cancellation stops new real decryptions while the same account remains unlocked', () => {
  it('keeps real care-plan records and their patient filter unchanged with a current strict generation', async () => {
    const env = await device();
    await addPlans(env);
    const expected = await env.vault.listCarePlans(), isCurrent = vi.fn(() => true);
    expect(expected).toHaveLength(2);
    expect(await env.vault.listCarePlans({ strict: true, isCurrent })).toEqual(expected);
    expect(await env.vault.listCarePlans({ patientId: env.primary, strict: true, isCurrent })).toEqual(expected);
    expect(await env.vault.listCarePlans({ patientId: env.external, strict: true, isCurrent })).toEqual([]);
    expect(isCurrent).toHaveBeenCalled();
  });

  it.each(cancellableReaders)('$api refuses a cancelled generation before its first adapter read', async ({ api, list }) => {
    const env = await device(), isCurrent = vi.fn(() => false);
    const read = vi.spyOn(env.adapter, list), decrypt = vi.spyOn(env.win.VildaCrypto, 'decryptString');
    await expect(env.vault[api]({ strict: true, isCurrent })).rejects.toMatchObject({ code: 'VAULT_READ_CANCELLED' });
    expect(isCurrent).toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled(); expect(decrypt).not.toHaveBeenCalled();
    expect(env.vault.isUnlocked()).toBe(true);
    expect(env.vault.getCurrentUser().userId).toBe(env.account);
  });

  for (const reader of cancellableReaders) {
    it.each(['adapter delivery', 'actual decryption'])(`${reader.api}: cancelling during %s prevents all following record decryptions`, async stage => {
      const env = await device(), entered = deferred(), released = deferred();
      if (reader.api === 'listCarePlans') await addPlans(env);
      const stored = await env.adapter[reader.list](env.account);
      const records = reader.api === 'listCarePlans' ? stored.filter(note => note.category === 'care-plan') : stored;
      expect(records.length).toBeGreaterThanOrEqual(2);
      const oldIvs = new Set(records.map(record => record[reader.cipher].iv));
      const originalDecrypt = env.win.VildaCrypto.decryptString.bind(env.win.VildaCrypto);
      const decrypt = vi.spyOn(env.win.VildaCrypto, 'decryptString');
      const originalList = env.adapter[reader.list].bind(env.adapter);
      const reads = ['listPatientsForUser', 'listPatientNotesForUser'].map(method => vi.spyOn(env.adapter, method));
      if (stage === 'adapter delivery') {
        env.adapter[reader.list].mockImplementationOnce(async (...args) => {
          const rows = await originalList(...args); entered.resolve(); await released.promise; return rows;
        });
      } else {
        decrypt.mockImplementationOnce(async (...args) => {
          const plaintext = await originalDecrypt(...args); entered.resolve(); await released.promise; return plaintext;
        });
      }
      let current = true;
      const isCurrent = vi.fn(() => current);
      const pending = env.vault[reader.api]({ strict: true, isCurrent }).then(value => ({ value }), error => ({ error }));
      await entered.promise;
      for (const read of reads) read.mockClear();
      current = false; released.resolve();
      const result = await pending;
      expect(result.error).toMatchObject({ code: 'VAULT_READ_CANCELLED' });
      expect(result.value).toBeUndefined();
      expect(decrypt.mock.calls.filter(([, iv]) => oldIvs.has(iv))).toHaveLength(stage === 'adapter delivery' ? 0 : 1);
      for (const read of reads) expect(read).not.toHaveBeenCalled();
      expect(env.vault.isUnlocked()).toBe(true);
      expect(env.vault.getCurrentUser().userId).toBe(env.account);
      expect(isCurrent.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  }

  it.each(cancellableReaders)('$api keeps the real session fence when an isCurrent callback locks the account but returns true', async ({ api, list }) => {
    const env = await device();
    const read = vi.spyOn(env.adapter, list), decrypt = vi.spyOn(env.win.VildaCrypto, 'decryptString');
    const isCurrent = vi.fn(() => { env.vault.lock('manual'); return true; });
    await expect(env.vault[api]({ strict: true, isCurrent })).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
    expect(isCurrent).toHaveBeenCalledOnce();
    expect(read).not.toHaveBeenCalled(); expect(decrypt).not.toHaveBeenCalled();
  });

  it.each(cancellableReaders)('$api ignores the generation callback unless strict reading was explicitly requested', async ({ api, cipher }) => {
    const env = await device();
    if (api === 'listCarePlans') await addPlans(env);
    if (api !== 'listCarePlans') {
      if (cipher === 'headerCipher') {
        const stored = await env.adapter.getPatientForUser(env.account, env.primary);
        await env.adapter.putPatientForUser(env.account, { ...stored, headerCipher: corruptCipher(stored.headerCipher) });
      } else {
        const stored = await env.adapter.getPatientNoteForUser(env.account, env.firstNote);
        await env.adapter.putPatientNoteForUser(env.account, { ...stored, bodyCipher: corruptCipher(stored.bodyCipher) });
      }
    }
    const expected = await env.vault[api](), isCurrent = vi.fn(() => false);
    expect(await env.vault[api]({ strict: false, isCurrent })).toEqual(expected);
    expect(isCurrent).not.toHaveBeenCalled();
  });
});
