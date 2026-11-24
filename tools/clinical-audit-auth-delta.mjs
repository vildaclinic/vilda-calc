// Reconstruct the two reviewed AuthUI images across the Gabinet / audyt merge.
// Offsets are UTF-8 bytes in the pre-merge image. Previous security baselines
// are verified independently by their original tools after reversing this layer.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

const delta = JSON.parse(readFileSync(new URL('../tests/fixtures/clinical-audit-auth-delta.json', import.meta.url), 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const BASE = 'ddb115c8990ae53af311a4b322fef41e25d9fb5d0a9567c70e76ed8145516a39';
const INTEGRATED = '27609864105b4e3295d09814283ef8cb38726f0e0f52648191c6e1ce9144b116';
if (delta.baseSHA256 !== BASE || delta.integratedSHA256 !== INTEGRATED) throw new Error('Unexpected clinical AuthUI checkpoint.');

function transform(source, reverse) {
  const expected = reverse ? INTEGRATED : BASE;
  const target = reverse ? BASE : INTEGRATED;
  const input = Buffer.from(source, 'utf8');
  if (hash(input) !== expected) throw new Error('AuthUI differs from its reviewed clinical audit checkpoint.');
  const output = [];
  let cursor = 0, shift = 0;
  for (const {offset, before, after} of delta.changes) {
    const old = Buffer.from(reverse ? after : before), replacement = Buffer.from(reverse ? before : after);
    const start = offset + (reverse ? shift : 0), end = start + old.length;
    if (!Number.isSafeInteger(start) || start < cursor || end > input.length || !input.subarray(start, end).equals(old)) {
      throw new Error('Invalid clinical AuthUI change at ' + offset);
    }
    output.push(input.subarray(cursor, start), replacement);
    if (reverse) shift += old.length - replacement.length;
    cursor = end;
  }
  output.push(input.subarray(cursor));
  const result = Buffer.concat(output);
  if (hash(result) !== target) throw new Error('Clinical AuthUI delta did not reproduce the target.');
  return result.toString('utf8');
}

export function hasClinicalAuditAuth(source) {
  return source.includes('legacySummary:i.VildaHomePatientNative.describeLegacy(KlL ? KlL.grupy : [])');
}
export function reverseClinicalAuditAuth(source) { return transform(source, true); }
export function applyClinicalAuditAuth(source) { return transform(source, false); }
export function replayClinicalAuditIfBase(source) { return hash(source) === BASE ? applyClinicalAuditAuth(source) : source; }
