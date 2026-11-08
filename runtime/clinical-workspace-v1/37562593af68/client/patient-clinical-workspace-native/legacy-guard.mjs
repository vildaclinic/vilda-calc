// The retained native database is a recovery copy after cutover. An older tab
// can still write it, so compare its complete encrypted clinical image without
// decrypting every record or changing either copy.
import { canonicalBytes, digest } from '../patient-clinical-workspace-source/common.mjs';
export async function nativeImageDigest(image) {
  const stable = structuredClone(image), meta = stable.clinicalMeta.value;
  // Native authentication/preferences writers may materialize empty clinical
  // containers while preserving their content. Absence and an empty container
  // have identical clinical meaning; populated and unknown data stay exact.
  if (Array.isArray(meta.snapshotTombstones) && meta.snapshotTombstones.length === 0) delete meta.snapshotTombstones;
  if (meta.userPreferences && Object.keys(meta.userPreferences).length === 0) delete meta.userPreferences;
  const bytes = canonicalBytes(stable);
  try { return await digest(bytes); } finally { bytes.fill(0); }
}
export function nativeImageIsEmpty(image) {
  const empty = value => value === null || Array.isArray(value) && value.length === 0
    || value && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every(empty);
  return image.stores.every(store => store.records.length === 0) && image.shadows.length === 0
    && empty(image.clinicalMeta.value);
}
