import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertLegacyVisitUpgrade, captureColdUpgradeRecords } from '../support/cold-upgrade-record-proof.mjs';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const visit = {
  version: 1, visitId: 'f4da51e9-f258-8e89-88e5-2a4a7045d288', patientId: 'fictional-old-patient',
  clinicalDateISO: '2026-06-17', createdAtISO: '2026-06-17T00:00:00.000Z', origin: 'legacy-inferred', dateSource: 'measuredAt',
};

function proof(includeNotes = false) {
  const patient = { patientId: 'fictional-old-patient', header: { name: 'Fictional' }, snapshotCount: 1,
    snapshots: [{ snapshotId: 'fictional-snapshot', savedAtISO: '2026-06-17T12:00:00.000Z', rev: 1,
      payload: { version: 1, user: { measuredAtISO: '2026-06-17', height: 142 },
        _pinnedState: { pin: false, at: null, h: '4gtt8p.1s' }, _contentAtISO: '2026-06-17T12:00:00.000Z' } }] };
  const records = [includeNotes ? { patient, notes: [{ id: 'fictional-note', body: 'Synthetic test only' }] } : patient];
  const rawClinicalStorage = { name: 'vilda_user_fictional', version: 5,
    stores: { patients: [{ patientId: patient.patientId, headerCipher: 'original-header-cipher' }],
      snapshots: [{ snapshotId: 'fictional-snapshot', payloadCipher: 'original-payload-cipher' }],
      patientNotes: [], tombstones: [], meta: [
        ['Object', [['id', ['string', 'singleton']], ['userId', ['string', 'fictional']],
          ['snapshotTombstones', ['Object', [['fictional-deleted-snapshot', ['Object', [
            ['cipher', ['string', 'original-trash-cipher']], ['visitCipher', ['string', 'original-visit-cipher']],
          ]]]]]]]],
        ['Object', [['id', ['string', 'cien:synthetic-iv']], ['cipher', ['string', 'original-shadow-cipher']]]],
      ] },
    keys: { patients: ['fictional-old-patient'], snapshots: ['fictional-snapshot'], patientNotes: [], tombstones: [],
      meta: [['string', 'singleton'], ['string', 'cien:synthetic-iv']] } };
  const before = { records, rawClinicalStorage, fingerprint: hash(records), rawClinicalFingerprint: hash(rawClinicalStorage) };
  const after = structuredClone(before);
  const target = includeNotes ? after.records[0].patient : after.records[0];
  target.snapshots[0].payload.visit = structuredClone(visit);
  target.snapshots[0].payload._pinnedState.h = 'xg6adb.89';
  after.fingerprint = hash(after.records);
  after.rawClinicalStorage.stores.meta[0][1].push(['clinicalScrubDoneV1', ['boolean', true]]);
  after.rawClinicalFingerprint = hash(after.rawClinicalStorage);
  return { before, after, target };
}

describe('exact public projection proof across an old-release cold upgrade', () => {
  it.each([false, true])('accepts only deterministic inference and its complete W3 checksum (notes: %s)', includeNotes => {
    const { before, after } = proof(includeNotes);
    expect(() => assertLegacyVisitUpgrade(before, after, { includeNotes })).not.toThrow();
    expect(after.rawClinicalStorage.stores.snapshots).toEqual(before.rawClinicalStorage.stores.snapshots);
    expect(after.fingerprint).not.toBe(before.fingerprint);
  });

  it.each([
    ['UUID', payload => { payload.visit.visitId = '11111111-1111-8111-8111-111111111111'; }],
    ['patient owner', payload => { payload.visit.patientId = 'other-fictional-patient'; }],
    ['clinical date', payload => { payload.visit.clinicalDateISO = '2026-06-18'; }],
    ['creation timestamp', payload => { payload.visit.createdAtISO = '2026-06-17T00:00:00.001Z'; }],
    ['inference provenance', payload => { payload.visit.origin = 'explicit'; }],
    ['date provenance', payload => { payload.visit.dateSource = 'savedAt'; }],
    ['future version', payload => { payload.visit.version = 2; }],
    ['unexpected metadata', payload => { payload.visit.unreviewed = true; }],
    ['clinical measurement', payload => { payload.user.height = 143; }],
    ['pin value', payload => { payload._pinnedState.pin = true; }],
    ['pin clock', payload => { payload._pinnedState.at = '2026-06-17T13:00:00.000Z'; }],
    ['checksum', payload => { payload._pinnedState.h = 'arbitrary'; }],
    ['content timestamp', payload => { payload._contentAtISO = '2026-06-17T12:00:00.001Z'; }],
  ])('rejects a changed %s even when the observed fingerprint is internally consistent', (_label, mutate) => {
    const { before, after, target } = proof();
    mutate(target.snapshots[0].payload); after.fingerprint = hash(after.records);
    expect(() => assertLegacyVisitUpgrade(before, after)).toThrow();
  });

  it('rejects an encrypted record write hidden by an unchanged public projection', () => {
    const { before, after } = proof();
    after.rawClinicalStorage.stores.snapshots[0].payloadCipher = 'rewritten-payload-cipher';
    after.rawClinicalFingerprint = hash(after.rawClinicalStorage);
    expect(() => assertLegacyVisitUpgrade(before, after)).toThrow();
  });

  it('rejects a general note change during the upgrade', () => {
    const { before, after } = proof(true);
    after.records[0].notes[0].body = 'Unintended change'; after.fingerprint = hash(after.records);
    expect(() => assertLegacyVisitUpgrade(before, after, { includeNotes: true })).toThrow();
  });

  it('rejects a changed IndexedDB key even with identical row values', () => {
    const { before, after } = proof();
    after.rawClinicalStorage.keys.snapshots[0] = 'different-storage-key';
    after.rawClinicalFingerprint = hash(after.rawClinicalStorage);
    expect(() => assertLegacyVisitUpgrade(before, after)).toThrow();
  });

  it('rejects an extra technical revision', () => {
    const { before, after, target } = proof();
    target.snapshots.push(structuredClone(target.snapshots[0])); target.snapshotCount += 1;
    after.fingerprint = hash(after.records);
    expect(() => assertLegacyVisitUpgrade(before, after)).toThrow();
  });

  it.each([
    ['encrypted tombstone', meta => { meta[0][1][2][1][1][0][1][1][0][1][1] = 'changed-trash-cipher'; }],
    ['tombstone visit identity', meta => { meta[0][1][2][1][1][0][1][1][1][1][1] = 'changed-visit-cipher'; }],
    ['clinical shadow row', meta => { meta[1][1][1][1][1] = 'changed-shadow-cipher'; }],
    ['singleton owner', meta => { meta[0][1][1][1][1] = 'different-account'; }],
    ['unapproved migration flag', meta => { meta[0][1].push(['anotherMigration', ['boolean', true]]); }],
    ['wrong approved flag value', meta => { meta[0][1].at(-1)[1][1] = false; }],
  ])('rejects a changed meta %s', (_label, mutate) => {
    const { before, after } = proof();
    mutate(after.rawClinicalStorage.stores.meta);
    after.rawClinicalFingerprint = hash(after.rawClinicalStorage);
    expect(() => assertLegacyVisitUpgrade(before, after)).toThrow();
  });

  it('preserves a previously recorded scrub marker without special rewriting', () => {
    const { before, after } = proof();
    before.rawClinicalStorage.stores.meta[0][1].push(['clinicalScrubDoneV1', ['boolean', true]]);
    before.rawClinicalFingerprint = hash(before.rawClinicalStorage);
    expect(() => assertLegacyVisitUpgrade(before, after)).not.toThrow();
  });
});

describe('raw clinical storage observer', () => {
  afterEach(() => vi.unstubAllGlobals());

  function observer(payloadCipher) {
    const request = value => {
      const pending = { result: value };
      queueMicrotask(() => pending.onsuccess());
      return pending;
    };
    const database = { version: 5, objectStoreNames: ['meta', 'patients', 'snapshots'], close: vi.fn(),
      transaction: vi.fn((names, mode) => {
        expect(names).toEqual(['meta', 'patients', 'snapshots']); expect(mode).toBe('readonly');
        return { objectStore: name => ({
          getAll: () => request(name === 'snapshots' ? [{ snapshotId: 'fictional-snapshot', payloadCipher, optional: undefined }]
            : [{ patientId: 'fictional-old-patient' }]),
          getAllKeys: () => request([name === 'snapshots' ? 'fictional-snapshot' : 'fictional-old-patient']),
        }) };
      }) };
    const patient = proof().before.records[0];
    vi.stubGlobal('window', { VildaVault: { USER_DB_PREFIX: 'vilda_user_',
      getCurrentUser: () => ({ userId: 'fictional' }), getPatient: async () => patient } });
    vi.stubGlobal('indexedDB', { open: () => request(database) });
    return { owner: { evaluate: (fn, args) => fn(args) }, database };
  }

  it('captures exact cipher bytes, typed-array offsets, undefined fields and primary keys', async () => {
    const binary = new Uint8Array([1, 255, 3]);
    const { owner, database } = observer({ iv: binary.buffer, data: new Uint8Array(binary.buffer, 1, 1) });
    const before = await captureColdUpgradeRecords(owner, ['fictional-old-patient']);
    expect(before.rawClinicalStorage.stores.snapshots).toEqual([['Object', [
      ['snapshotId', ['string', 'fictional-snapshot']],
      ['payloadCipher', ['Object', [['iv', ['ArrayBuffer', [1, 255, 3]]], ['data', ['Uint8Array', [255]]]]]],
      ['optional', ['undefined']],
    ]]]);
    expect(before.rawClinicalStorage.keys.snapshots).toEqual([['string', 'fictional-snapshot']]);
    binary[1] = 254;
    const after = await captureColdUpgradeRecords(owner, ['fictional-old-patient']);
    expect(after.rawClinicalFingerprint).not.toBe(before.rawClinicalFingerprint);
    expect(after.fingerprint).toBe(before.fingerprint);
    expect(database.close).toHaveBeenCalledTimes(2);
  });

  it('rejects unsupported storage types instead of silently serializing them as empty objects', async () => {
    const { owner, database } = observer(new Map([['cipher', 'synthetic']]));
    await expect(captureColdUpgradeRecords(owner, ['fictional-old-patient'])).rejects.toThrow('Unsupported raw clinical storage value');
    expect(database.close).toHaveBeenCalledOnce();
  });
});
