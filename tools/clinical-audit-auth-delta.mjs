// Reconstruct the reviewed AuthUI images across the Gabinet / audyt merge
// and the subsequent focus and Zemel updates. Each offset is a UTF-8 byte
// position in its layer's source image. The original tools still verify the
// prior security baselines after these changes are reversed.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

const delta = JSON.parse(readFileSync(new URL('../tests/fixtures/clinical-audit-auth-delta.json', import.meta.url), 'utf8'));
const zemel = JSON.parse(readFileSync(new URL('../tests/fixtures/zemel-auth-delta.json', import.meta.url), 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const BASE = 'ddb115c8990ae53af311a4b322fef41e25d9fb5d0a9567c70e76ed8145516a39';
const INTEGRATED = '27609864105b4e3295d09814283ef8cb38726f0e0f52648191c6e1ce9144b116';
const FOCUS_CHECK = '41a284fe95f22849d5fb553109eb9446d175dc44280edf9aa0643d429ca95bb4';
const ZEMEL = '0454ef3ceffe9e4c7450a7763ed797ba1455dc45c31f20c90a8cc7037bc6f2d7';
if (delta.baseSHA256 !== BASE || delta.integratedSHA256 !== INTEGRATED) throw new Error('Unexpected clinical AuthUI checkpoint.');
if (zemel.baseSHA256 !== FOCUS_CHECK || zemel.integratedSHA256 !== ZEMEL) throw new Error('Unexpected Zemel AuthUI checkpoint.');

function transform(source, reverse, layer = delta) {
  const expected = reverse ? layer.integratedSHA256 : layer.baseSHA256;
  const target = reverse ? layer.baseSHA256 : layer.integratedSHA256;
  const input = Buffer.from(source, 'utf8');
  if (hash(input) !== expected) throw new Error('AuthUI differs from its reviewed clinical audit checkpoint.');
  const output = [];
  let cursor = 0, shift = 0;
  for (const {offset, before, after} of layer.changes) {
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
const invalidate = '  BscReadId += 1; BscCache = null; BscRefresh();';
const focusCheck = `  // Focus can return during a statistics read or export. Refresh the directory
  // only when this account's saved duplicate dismissals need another read.
  if (!event && BscCache && BscCache.scope === scope && !BscCache.error) {
    try { if (scope.storage.getItem(scope.key) === BscCache.raw) return; }
    catch (_) { /* Discard the cache and retry through the normal refresh. */ }
  }
` + invalidate;

function transformFocusCheck(source, reverse) {
  const from = reverse ? focusCheck : invalidate, to = reverse ? invalidate : focusCheck;
  if (hash(source) !== (reverse ? FOCUS_CHECK : INTEGRATED) || source.split(from).length !== 2)
    throw new Error('Unexpected duplicate-dismissal focus checkpoint.');
  const result = source.replace(from, to);
  if (hash(result) !== (reverse ? INTEGRATED : FOCUS_CHECK)) throw new Error('Incorrect duplicate-dismissal focus replay.');
  return result;
}
export function reverseClinicalAuditAuth(source) {
  const focused = hash(source) === ZEMEL ? transform(source, true, zemel) : source;
  return transform(hash(focused) === INTEGRATED ? focused : transformFocusCheck(focused, true), true);
}
export function applyClinicalAuditAuth(source, original) {
  const integrated = transform(source, false);
  if (original === integrated) return integrated;
  const focused = transformFocusCheck(integrated, false);
  return original === focused ? focused : transform(focused, false, zemel);
}
export function replayClinicalAuditIfBase(source) { return hash(source) === BASE ? applyClinicalAuditAuth(source) : source; }
