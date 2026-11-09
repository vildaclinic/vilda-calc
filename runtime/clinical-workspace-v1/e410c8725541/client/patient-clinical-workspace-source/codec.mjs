import { MAX_SOURCE_BYTES, SOURCE_FORMAT, STORES, CIPHER_FIELDS, KEY_FIELDS, HEX, own, object,
  compare, encoder, exact, canonicalCopy, canonicalBytes, decodeCanonical, bytesCopy,
  digest, digestJson, inspectCipher, unbase64, checkIdentity, fail } from './common.mjs';

const NAMESPACE = 'vilda-patient-clinical-workspace';
const SOURCE_ID_DOMAIN = 'vilda/patient-clinical-workspace/source-id/v1\0';
const SHADOW_ID_DOMAIN = 'vilda/patient-clinical-workspace/shadow-id/v1';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const rowKey = store => KEY_FIELDS[store] || 'id';
function metaPath(path) {
  return path[0] === 'snapshotTombstones' && Number.isSafeInteger(path[1]) && path[1] >= 0
    && (path.length === 3 && path[2] === 'payloadCipher'
      || path.length === 5 && path[2] === 'Bpk' && path[3] === 't' && path[4] === 'c');
}
function atPath(value, path) {
  let parent = value;
  for (const key of path.slice(0, -1)) {
    if (!parent || typeof parent !== 'object' || !own(parent, key)) fail('CORRUPT');
    if (Array.isArray(parent) ? !Number.isSafeInteger(key) || key < 0 : typeof key !== 'string') fail('CORRUPT');
    parent = parent[key];
  }
  if (!object(parent) || typeof path.at(-1) !== 'string') fail('CORRUPT');
  return { parent, leaf: path.at(-1) };
}
function reference(value) {
  if (!object(value) || Object.keys(value).length !== 2 || !own(value, 'iv') || value.cien !== 1) return false;
  unbase64(value.iv, 12, 12).fill(0); return true;
}
function operationalReference(value) {
  return object(value) && Object.keys(value).length === 1 && typeof value.workspaceShadowId === 'string'
    && /^shadow:[a-f0-9]{64}:[0-9]+$/.test(value.workspaceShadowId);
}
function metadata(value, path = [], mode = 'raw', references = []) {
  if (metaPath(path) && value !== null) {
    if (mode === 'raw') {
      if (reference(value)) references.push({ key: value.iv, path });
      else inspectCipher(value);
    } else if (operationalReference(value)) references.push({ key: value.workspaceShadowId, path });
    else fail('UNSUPPORTED');
    return references;
  }
  if (!value || typeof value !== 'object') return references;
  if (object(value) && own(value, 'iv') && (own(value, 'data') || own(value, 'ciphertext'))) fail('UNSUPPORTED');
  for (const key of Object.keys(value)) {
    if (/^(?:encryptedMasterByPassword|encryptedMasterByRecovery|encryptedSisByMaster|passwordSalt|recoverySalt|passkeys|passkeyTombstones|authToken|resumeSecret|privateKey|sealKey)$/.test(key)) fail('UNSUPPORTED');
    const next = path.concat(Array.isArray(value) ? Number(key) : key);
    if (/cipher$/i.test(key) && value[key] !== null && !metaPath(next)) fail('UNSUPPORTED');
    metadata(value[key], next, mode, references);
  }
  return references;
}
function inspectClinicalMeta(entry, operational = false) {
  exact(entry, operational ? ['key', 'value', 'plaintext'] : ['key', 'value']);
  if (entry.key !== 'singleton' || !object(entry.value)
    || Object.keys(entry.value).some(key => !['snapshotTombstones', 'userPreferences'].includes(key))) fail('UNSUPPORTED');
  if (own(entry.value, 'snapshotTombstones') && (!Array.isArray(entry.value.snapshotTombstones)
    || entry.value.snapshotTombstones.some(item => !object(item)))) fail('CORRUPT');
  if (own(entry.value, 'userPreferences') && (!object(entry.value.userPreferences)
    || Object.keys(entry.value.userPreferences).some(key => !['wllists', 'wlsched'].includes(key)))) fail('UNSUPPORTED');
  if (operational) inspectPlaintext(entry, null);
  return metadata(entry.value, [], operational ? 'operational' : 'raw');
}
function inspectPlaintext(entry, expectedPath) {
  if (!Array.isArray(entry.plaintext)) fail();
  if (expectedPath && (entry.plaintext.length !== 1 || !same(entry.plaintext[0]?.path, expectedPath))) fail('CORRUPT');
  let previous = null;
  for (const part of entry.plaintext) {
    exact(part, ['path', 'value']);
    if (!Array.isArray(part.path) || !part.path.length || part.path.length > 8 || !object(part.value)) fail();
    if (!expectedPath && !metaPath(part.path)) fail('UNSUPPORTED');
    const key = JSON.stringify(part.path);
    if (previous !== null && previous >= key) fail('CONFLICT');
    previous = key;
    const { parent, leaf } = atPath(entry.value, part.path);
    if (own(parent, leaf)) fail('CONFLICT');
  }
}
function inspectRows(store, operational) {
  exact(store, ['name', 'records']);
  if (!STORES.includes(store.name) || !Array.isArray(store.records)) fail('UNSUPPORTED');
  let previous = null;
  const field = CIPHER_FIELDS[store.name];
  for (const entry of store.records) {
    exact(entry, operational ? ['key', 'value', 'plaintext'] : ['key', 'value']);
    checkIdentity(entry.key);
    if (previous !== null && previous >= entry.key) fail('CONFLICT');
    previous = entry.key;
    if (!object(entry.value) || entry.value[rowKey(store.name)] !== entry.key) fail('CONFLICT');
    if (store.name === 'snapshots' || store.name === 'patientNotes') checkIdentity(entry.value.patientId);
    if (own(entry.value, 'rev') && (!Number.isSafeInteger(entry.value.rev) || entry.value.rev < 0)) fail('CORRUPT');
    const rest = { ...entry.value };
    if (operational) {
      if (field) inspectPlaintext(entry, [field]);
      else if (!Array.isArray(entry.plaintext) || entry.plaintext.length) fail('CORRUPT');
    } else if (field) { inspectCipher(rest[field]); delete rest[field]; }
    metadata(rest);
  }
}
function inspectStores(stores, operational) {
  if (!Array.isArray(stores) || stores.length !== STORES.length) fail('UNSUPPORTED');
  stores.forEach((store, index) => {
    if (store?.name !== STORES[index]) fail('UNSUPPORTED'); inspectRows(store, operational);
  });
}
function inspectRawImage(input, includeIdentity = true) {
  const value = canonicalCopy(input);
  exact(value, includeIdentity ? ['accountBinding', 'databaseVersion', 'stores', 'clinicalMeta', 'shadows']
    : ['stores', 'clinicalMeta', 'shadows']);
  if (includeIdentity && (typeof value.accountBinding !== 'string' || !HEX.test(value.accountBinding)
    || ![5, 6].includes(value.databaseVersion))) fail('UNSUPPORTED');
  inspectStores(value.stores, false);
  const references = inspectClinicalMeta(value.clinicalMeta), ids = new Set();
  if (!Array.isArray(value.shadows)) fail();
  let previous = null;
  for (const entry of value.shadows) {
    exact(entry, ['key', 'value']);
    exact(entry.value, ['id', 'key', 'patientId', 'snapshotId', 'od', 'c']);
    if (typeof entry.key !== 'string' || entry.key !== 'cien:' + entry.value.key || entry.value.id !== entry.key
      || entry.value.c?.iv !== entry.value.key || typeof entry.value.od !== 'string') fail('CORRUPT');
    if (previous !== null && previous >= entry.key) fail('CONFLICT');
    previous = entry.key;
    checkIdentity(entry.value.patientId); checkIdentity(entry.value.snapshotId); inspectCipher(entry.value.c);
    ids.add(entry.value.key);
  }
  if (references.some(ref => !ids.has(ref.key))) fail('CORRUPT');
  canonicalBytes(value).fill(0);
  return value;
}
export function inspectWorkspacePack(input) {
  const value = canonicalCopy(input);
  exact(value, ['namespace', 'protocol', 'accountBinding', 'databaseVersion', 'stores', 'clinicalMeta',
    'shadows', 'carePlansV2', 'legacyRecovery']);
  if (value.namespace !== NAMESPACE || value.protocol !== 1 || !HEX.test(value.accountBinding)
    || ![5, 6].includes(value.databaseVersion)) fail('UNSUPPORTED');
  inspectStores(value.stores, true);
  const references = inspectClinicalMeta(value.clinicalMeta, true), ids = new Set();
  if (!Array.isArray(value.shadows)) fail();
  let previous = null;
  for (const entry of value.shadows) {
    exact(entry, ['key', 'value', 'plaintext']); exact(entry.value, ['patientId', 'snapshotId', 'od']);
    if (typeof entry.key !== 'string' || !/^shadow:[a-f0-9]{64}:[0-9]+$/.test(entry.key)
      || previous !== null && previous >= entry.key || typeof entry.value.od !== 'string') fail('CORRUPT');
    previous = entry.key; ids.add(entry.key);
    checkIdentity(entry.value.patientId); checkIdentity(entry.value.snapshotId); inspectPlaintext(entry, ['c']);
  }
  if (references.some(ref => !ids.has(ref.key))) fail('CORRUPT');
  if (!object(value.carePlansV2)) fail();
  for (const [key, plan] of Object.entries(value.carePlansV2)) { checkIdentity(key); if (!object(plan)) fail(); }
  inspectRawImage(value.legacyRecovery, false);
  canonicalBytes(value).fill(0);
  return value;
}
export function encodeWorkspacePack(input) { return canonicalBytes(inspectWorkspacePack(input)); }
export function decodeWorkspacePack(bytes) { return inspectWorkspacePack(decodeCanonical(bytes)); }
export function operationalPart(pack) {
  return { accountBinding: pack.accountBinding, stores: pack.stores, clinicalMeta: pack.clinicalMeta,
    shadows: pack.shadows, carePlansV2: pack.carePlansV2 };
}
export async function workspaceDigests(pack) {
  return { operationalDigest: await digestJson(operationalPart(pack)), recoveryDigest: await digestJson(pack.legacyRecovery) };
}
export async function createWorkspaceSource(pack) {
  const checked = inspectWorkspacePack(pack), bytes = canonicalBytes(checked);
  try {
    return Object.freeze({ sourceId: await digest(encoder.encode(SOURCE_ID_DOMAIN + checked.accountBinding)),
      sourceRevision: await digest(bytes), format: SOURCE_FORMAT, bytes, offlineFrontier: Object.freeze([]) });
  } catch (error) { bytes.fill(0); throw error; }
}
export async function verifyWorkspaceSource(input) {
  const value = exact(input, ['sourceId', 'sourceRevision', 'format', 'bytes', 'offlineFrontier']);
  if (value.format !== SOURCE_FORMAT || !HEX.test(value.sourceId) || !HEX.test(value.sourceRevision)
    || !Array.isArray(value.offlineFrontier) || value.offlineFrontier.length) fail('UNSUPPORTED');
  const bytes = bytesCopy(value.bytes);
  try {
    const pack = decodeWorkspacePack(bytes);
    if (value.sourceRevision !== await digest(bytes)
      || value.sourceId !== await digest(encoder.encode(SOURCE_ID_DOMAIN + pack.accountBinding))) fail('CONFLICT');
    return pack;
  } finally { bytes.fill(0); }
}
function callbacks(input, names, optional = []) {
  const options = exact(input, names, optional);
  for (const name of names) if (typeof options[name] !== 'function') fail();
  return options;
}
async function decryptPart(entry, path, options) {
  const { parent, leaf } = atPath(entry.value, path), encrypted = inspectCipher(parent[leaf]);
  options.assertCurrent();
  let plaintext;
  try { plaintext = await options.decrypt(encrypted.iv, encrypted.data); }
  catch { options.assertCurrent(); fail('CORRUPT'); }
  options.assertCurrent();
  plaintext = canonicalCopy(plaintext);
  if (!object(plaintext)) fail('CORRUPT');
  delete parent[leaf]; entry.plaintext.push({ path: [...path], value: plaintext });
}
/** A record helper for the private native adapter; this is not an authorization API. */
export async function captureRecord(store, raw, input) {
  const options = callbacks(input, ['decrypt', 'assertCurrent']);
  const copied = canonicalCopy(raw); exact(copied, ['key', 'value']);
  const entry = { ...copied, plaintext: [] };
  if (store === 'meta') {
    inspectClinicalMeta(copied);
    const tombstones = entry.value.snapshotTombstones || [];
    for (let index = 0; index < tombstones.length; index++) {
      for (const path of [['snapshotTombstones', index, 'payloadCipher'], ['snapshotTombstones', index, 'Bpk', 't', 'c']]) {
        let location;
        try { location = atPath(entry.value, path); } catch { continue; }
        const value = location.parent[location.leaf];
        if (value === undefined || value === null || reference(value)) continue;
        await decryptPart(entry, path, options);
      }
    }
  } else if (store === 'shadows') await decryptPart(entry, ['c'], options);
  else {
    inspectRows({ name: store, records: [copied] }, false);
    if (CIPHER_FIELDS[store]) await decryptPart(entry, [CIPHER_FIELDS[store]], options);
  }
  entry.plaintext.sort((a, b) => compare(JSON.stringify(a.path), JSON.stringify(b.path)));
  options.assertCurrent(); return canonicalCopy(entry);
}
export async function projectRecord(input, callbacksInput) {
  const options = callbacks(callbacksInput, ['encrypt', 'assertCurrent']);
  const entry = canonicalCopy(input); exact(entry, ['key', 'value', 'plaintext']);
  for (const part of entry.plaintext) {
    exact(part, ['path', 'value']);
    const { parent, leaf } = atPath(entry.value, part.path);
    if (own(parent, leaf)) fail('CONFLICT');
    options.assertCurrent();
    let encrypted;
    try { encrypted = await options.encrypt(canonicalCopy(part.value)); }
    catch { options.assertCurrent(); fail('CORRUPT'); }
    options.assertCurrent(); parent[leaf] = canonicalCopy(inspectCipher(encrypted));
  }
  return { key: entry.key, value: entry.value };
}
/** readNativeImage must resolve only after one coherent native read transaction
 * completes under the caller's migration/operation fence. It contains clinical
 * singleton fields only. Keys, credentials and account metadata never enter. */
export async function captureWorkspaceSource(input) {
  const options = callbacks(input, ['readNativeImage', 'decrypt', 'assertCurrent'], ['previousSource', 'carePlansV2']);
  if (own(options, 'previousSource') && !object(options.previousSource)
    || own(options, 'carePlansV2') && !object(options.carePlansV2)) fail();
  options.assertCurrent();
  const image = inspectRawImage(await options.readNativeImage()); options.assertCurrent();
  const previous = options.previousSource ? await verifyWorkspaceSource(options.previousSource) : null;
  options.assertCurrent();
  if (previous && previous.accountBinding !== image.accountBinding) fail('CONFLICT');
  const pack = { namespace: NAMESPACE, protocol: 1, accountBinding: image.accountBinding,
    databaseVersion: image.databaseVersion, stores: [], clinicalMeta: null, shadows: [],
    carePlansV2: canonicalCopy(options.carePlansV2 ?? previous?.carePlansV2 ?? {}),
    legacyRecovery: previous ? previous.legacyRecovery : {
      stores: image.stores, clinicalMeta: image.clinicalMeta, shadows: image.shadows } };
  const recordOptions = { decrypt: options.decrypt, assertCurrent: options.assertCurrent };
  for (const store of image.stores) {
    const records = [];
    for (const row of store.records) records.push(await captureRecord(store.name, row, recordOptions));
    pack.stores.push({ name: store.name, records });
  }
  const refs = inspectClinicalMeta(image.clinicalMeta), byPhysical = new Map(), duplicates = new Map();
  for (const raw of image.shadows) {
    const captured = await captureRecord('shadows', raw, recordOptions);
    const value = { patientId: captured.value.patientId, snapshotId: captured.value.snapshotId, od: captured.value.od };
    const paths = refs.filter(ref => ref.key === raw.value.key).map(ref => ref.path)
      .sort((a, b) => compare(JSON.stringify(a), JSON.stringify(b)));
    const hash = await digestJson({ domain: SHADOW_ID_DOMAIN, value, plaintext: captured.plaintext, references: paths });
    options.assertCurrent();
    const index = duplicates.get(hash) || 0; duplicates.set(hash, index + 1);
    const key = 'shadow:' + hash + ':' + index;
    byPhysical.set(raw.value.key, key); pack.shadows.push({ key, value, plaintext: captured.plaintext });
  }
  pack.shadows.sort((a, b) => compare(a.key, b.key));
  pack.clinicalMeta = await captureRecord('meta', image.clinicalMeta, recordOptions);
  for (const ref of refs) {
    const { parent, leaf } = atPath(pack.clinicalMeta.value, ref.path);
    parent[leaf] = { workspaceShadowId: byPhysical.get(ref.key) };
  }
  options.assertCurrent();
  const source = await createWorkspaceSource(pack);
  try { options.assertCurrent(); return source; } catch (error) { source.bytes.fill(0); throw error; }
}
export async function reprojectWorkspaceSource(source, input) {
  const options = callbacks(input, ['encrypt', 'assertCurrent']);
  options.assertCurrent(); const pack = await verifyWorkspaceSource(source); options.assertCurrent();
  const image = { accountBinding: pack.accountBinding, databaseVersion: pack.databaseVersion,
    stores: [], clinicalMeta: null, shadows: [], carePlansV2: canonicalCopy(pack.carePlansV2) }, byLogical = new Map();
  for (const row of pack.shadows) {
    const projected = await projectRecord(row, options), iv = projected.value.c.iv;
    if ([...byLogical.values()].includes(iv)) fail('CONFLICT');
    byLogical.set(row.key, iv);
    projected.key = 'cien:' + iv; projected.value.id = projected.key; projected.value.key = iv;
    image.shadows.push(projected);
  }
  image.shadows.sort((a, b) => compare(a.key, b.key));
  for (const store of pack.stores) {
    const records = [];
    for (const row of store.records) records.push(await projectRecord(row, options));
    image.stores.push({ name: store.name, records });
  }
  const refs = inspectClinicalMeta(pack.clinicalMeta, true);
  image.clinicalMeta = await projectRecord(pack.clinicalMeta, options);
  for (const ref of refs) {
    const { parent, leaf } = atPath(image.clinicalMeta.value, ref.path);
    parent[leaf] = { iv: byLogical.get(ref.key), cien: 1 };
  }
  const { carePlansV2, ...raw } = image;
  const checked = inspectRawImage(raw); options.assertCurrent();
  return { ...checked, carePlansV2 };
}

export { MAX_SOURCE_BYTES, SOURCE_FORMAT, STORES };
