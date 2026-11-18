import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { verifyHistoricalVisitWorkspaceFamily } from '../../tools/build-visits-workspace-family.mjs';

const manifest = JSON.parse(readFileSync(new URL('../../runtime/clinical-workspace-v1/manifest.json', import.meta.url), 'utf8'));
const prefix = '../../runtime/clinical-workspace-v1/' + manifest.moduleTreeSHA256.slice(0, 12) + '/';
const codec = await import(new URL(prefix + 'client/patient-clinical-workspace-source/codec.mjs', import.meta.url));
const identity = { version: 1, visitId: 'f1c71000-0000-4000-8000-000000000001' };
const copy = value => JSON.parse(JSON.stringify(value));

async function fixture(value = identity) {
  const key = await webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const encrypt = async input => {
    const iv = webcrypto.getRandomValues(new Uint8Array(12));
    const data = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(input)));
    return { iv: Buffer.from(iv).toString('base64'), data: Buffer.from(data).toString('base64') };
  };
  const decrypt = async (iv, data) => JSON.parse(new TextDecoder().decode(await webcrypto.subtle.decrypt({
    name: 'AES-GCM', iv: Buffer.from(iv, 'base64') }, key, Buffer.from(data, 'base64'))));
  const image = {
    accountBinding: '1'.repeat(64), databaseVersion: 6,
    stores: codec.STORES.map(name => ({ name, records: [] })),
    clinicalMeta: { key: 'singleton', value: { snapshotTombstones: [{
      snapshotId: 'fictional-snapshot', patientId: 'fictional-patient', deletedAtISO: '2026-10-01T12:00:00.000Z',
      visitCipher: await encrypt(value),
    }] } }, shadows: [],
  };
  const guard = vi.fn();
  const capture = () => codec.captureWorkspaceSource({ readNativeImage: async () => copy(image), decrypt, assertCurrent: guard });
  return { image, encrypt, decrypt, guard, capture };
}

describe('durable visit identity in the current encrypted clinical workspace', () => {
  it('captures, serializes, verifies and re-encrypts the minimal identity after clinical shadow expiry', async () => {
    const f = await fixture(), original = copy(f.image);
    const source = await f.capture();
    const pack = await codec.verifyWorkspaceSource(source);
    expect(pack.clinicalMeta.plaintext).toEqual([{ path: ['snapshotTombstones', 0, 'visitCipher'], value: identity }]);
    expect(pack.clinicalMeta.value.snapshotTombstones[0]).not.toHaveProperty('visitCipher');
    expect(pack.legacyRecovery.clinicalMeta).toEqual(original.clinicalMeta);
    expect(pack.legacyRecovery.shadows).toEqual([]);
    expect(pack.clinicalMeta.plaintext[0].value).not.toHaveProperty('payload');
    // The same production serialization is consumed by workspace recovery.
    const bytes = codec.encodeWorkspacePack(pack);
    const reopened = await codec.createWorkspaceSource(codec.decodeWorkspacePack(bytes));
    expect(reopened.sourceRevision).toBe(source.sourceRevision);
    const projected = await codec.reprojectWorkspaceSource(reopened, { encrypt: f.encrypt, assertCurrent: f.guard });
    const cipher = projected.clinicalMeta.value.snapshotTombstones[0].visitCipher;
    expect(cipher.iv).not.toBe(original.clinicalMeta.value.snapshotTombstones[0].visitCipher.iv);
    expect(await f.decrypt(cipher.iv, cipher.data)).toEqual(identity);
    expect(f.image).toEqual(original);
    expect(f.guard).toHaveBeenCalled();
  });

  it('accepts legacy metadata without a visit identity and preserves unrelated clinical metadata', async () => {
    const f = await fixture(); delete f.image.clinicalMeta.value.snapshotTombstones[0].visitCipher;
    const payload = { user: { height: 123, weight: 24 }, note: 'Fikcyjne dane' };
    f.image.clinicalMeta.value.snapshotTombstones[0].payloadCipher = await f.encrypt(payload);
    const source = await f.capture();
    const projected = await codec.reprojectWorkspaceSource(source, { encrypt: f.encrypt, assertCurrent: f.guard });
    const tombstone = projected.clinicalMeta.value.snapshotTombstones[0];
    expect(tombstone).not.toHaveProperty('visitCipher');
    expect(await f.decrypt(tombstone.payloadCipher.iv, tombstone.payloadCipher.data)).toEqual(payload);
  });

  it.each(['otherCipher', 'privateKey', 'authToken'])('continues rejecting unapproved metadata %s', async field => {
    const f = await fixture();
    const row = f.image.clinicalMeta.value.snapshotTombstones[0]; row[field] = row.visitCipher;
    await expect(f.capture()).rejects.toMatchObject({ code: 'CLINICAL_SOURCE_UNSUPPORTED' });
  });

  it.each([
    { version: 2, visitId: identity.visitId },
    { version: 1, visitId: 'date-as-identity' },
    { ...identity, clinicalDateISO: '2026-10-01' },
    { ...identity, notes: ['Fikcyjna notatka'] },
  ])('rejects unsupported or excessive identity plaintext %#', async value => {
    const f = await fixture(value);
    await expect(f.capture()).rejects.toThrow();
  });

  it('does not accept a clinical-shadow reference as a durable identity cipher', async () => {
    const f = await fixture();
    const row = f.image.clinicalMeta.value.snapshotTombstones[0];
    row.visitCipher = { iv: row.visitCipher.iv, cien: 1 };
    await expect(f.capture()).rejects.toThrow();
  });

  it('still fences a patient session changed during identity decryption', async () => {
    const f = await fixture(); let current = true;
    await expect(codec.captureWorkspaceSource({ readNativeImage: async () => f.image,
      decrypt: async (...args) => { const result = await f.decrypt(...args); current = false; return result; },
      assertCurrent: () => { if (!current) throw new Error('fictional-session-changed'); } })).rejects.toThrow('fictional-session-changed');
  });

  it('reproduces the retained historical family and keeps every earlier module byte unchanged', () => {
    // The active family is built in the module source repository (vilda-source); the
    // historical family remains exactly the base family plus the readable codec.
    const built = verifyHistoricalVisitWorkspaceFamily();
    expect(built.moduleTreeSHA256).toBe('67818dc1656fcd24871e8621feb2131008e2746f70e920dfd628819b869a299c');
    expect(manifest.moduleTreeSHA256).not.toBe(built.moduleTreeSHA256);
    expect(built.sources.size).toBe(51);
    const retained = new Map(manifest.historicalFiles.map(entry => [entry.path, entry.sha256]));
    for (const path of built.sources.keys()) expect(retained.has(path), path).toBe(true);
    const previous = 'runtime/clinical-workspace-v1/e410c8725541/';
    const differences = [];
    for (const [path, source] of built.sources) {
      const name = path.slice(built.prefix.length);
      const old = readFileSync(new URL('../../' + previous + name, import.meta.url), 'utf8');
      if (old !== source) differences.push(name);
    }
    expect(differences).toEqual(['client/patient-clinical-workspace-source/codec.mjs']);
  });

  it('keeps the readable codec byte for byte equal to the codec module of the active family', () => {
    const readable = readFileSync(new URL('../../runtime/durable-visits-v1/workspace-source-codec.mjs', import.meta.url));
    const active = readFileSync(new URL(prefix + 'client/patient-clinical-workspace-source/codec.mjs', import.meta.url));
    expect(readable.equals(active)).toBe(true);
  });
});
