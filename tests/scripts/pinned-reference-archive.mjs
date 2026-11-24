import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

// Public primary-source evidence, not a patient backup. A changed source needs
// a separately reviewed pin. The policy still scans ALL decompressed text.
// CeZ: https://dane.gov.pl/pl/dataset/27/resource/55725 (31.03.2021).
const PIN = Object.freeze({
  path: 'tools/icd10-pl-source/source.xml.gz',
  bytes: 606817,
  sha256: '39ecb2cb69d0a170972bf68485d516201c25610e8d5767de362e32e1cb293a3b',
  expandedBytes: 12713248,
  expandedSHA256: '88a0c4ed4e4987d3cdc57f0a534a6c80506d757f197c39c1c22fa3a1ebdba099',
});
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export function readPinnedReferenceArchive(file, read = readFileSync) {
  if (file !== PIN.path) return null;
  const bytes = read(file);
  if (bytes.length !== PIN.bytes || hash(bytes) !== PIN.sha256)
    throw new Error('zmienione przypięte archiwum publicznego źródła');
  const expanded = gunzipSync(bytes, { maxOutputLength: PIN.expandedBytes });
  if (expanded.length !== PIN.expandedBytes || hash(expanded) !== PIN.expandedSHA256)
    throw new Error('zmieniona treść przypiętego publicznego źródła');
  return expanded.toString('utf8');
}
