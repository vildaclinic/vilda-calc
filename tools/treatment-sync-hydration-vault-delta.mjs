// Exact reversible outer Vault layer: a stored treatment document that lost its
// encrypted context on an older application version adopts it from the same
// version of the note in a sync payload. Three named hooks beside the existing
// care-plan hydration of the note merge; the layer below is restored first by
// its own tool, so earlier pins do not change.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = '46535d453ea21d342c7593830c4619584fe60298101271ffa8fb6ed52562db12';
const SOURCE = 'runtime/treatment-sync-hydration-v1/vault-fragment.js';
const MANIFEST = 'runtime/treatment-sync-hydration-v1/manifest.json';
const START = '/* BEGIN VILDA TREATMENT SYNC HYDRATION V1 */\n';
const END = '/* END VILDA TREATMENT SYNC HYDRATION V1 */\n';
const hash = value => createHash('sha256').update(value).digest('hex');
function fail(message) { throw new Error('Treatment sync hydration boundary: ' + message); }
function once(source, before, after, name) {
  if (source.split(before).length !== 2) fail('missing or ambiguous hook: ' + name);
  return source.replace(before, () => after);
}
function hooks(root) {
  const fragment = START + readFileSync(resolve(root, SOURCE), 'utf8') + END;
  const recovered = 'if(CareMvpRecovered){await P.putPatientNoteForUser(b,PatientClinicalWriteValue(b,CareMvpRecovered));Bses_pilnuj(e);Qch.push({id:g.id,patientId:g.patientId,action:"merge"});Nt++;Qdn.add(g.id);return PatientClinicalWriteValue(PatientClinicalOperationAccount,undefined);}\n}\n';
  return [
    // The pair reaches the note lock although the payload is not newer.
    ['hydration-admit-pair', '&&!CareMvpMayMerge&&!CareMvpSyncHydrationCandidate(Ej,g)){',
      '&&!CareMvpMayMerge&&!CareMvpSyncHydrationCandidate(Ej,g)&&!TreatmentSyncHydrationCandidate(Ej,g)){'],
    // Under the note lock, on the freshly read record, right after the care-plan hydration.
    ['hydration-under-lock', recovered,
      recovered + 'if(!CareMvpIncomingWins&&TreatmentSyncHydrationCandidate(M,g)){\n'
      + 'const TreatmentRecovered=await TreatmentHydrateSyncRecord(M,g,function(){Bses_pilnuj(e)});Bses_pilnuj(e);\n'
      + 'if(TreatmentRecovered){await P.putPatientNoteForUser(b,PatientClinicalWriteValue(b,TreatmentRecovered));Bses_pilnuj(e);Qch.push({id:g.id,patientId:g.patientId,action:"merge"});Nt++;Qdn.add(g.id);return PatientClinicalWriteValue(PatientClinicalOperationAccount,undefined);}\n'
      + '}\n'],
    ['hydration-readable-source', '/* END VILDA DIAGNOSIS MUTATION V1 */\n',
      '/* END VILDA DIAGNOSIS MUTATION V1 */\n' + fragment],
  ];
}
function build(base, root) {
  if (hash(base) !== BASE) fail('unexpected reviewed base');
  const declared = hooks(root);
  for (const [name, before, after] of declared) base = once(base, before, after, name);
  parse(base, { ecmaVersion: 'latest' });
  return { source: base, manifest: { namespace: 'vilda-treatment-sync-hydration-vault', version: 1, baseVaultSHA256: BASE,
    source: SOURCE, sourceSHA256: hash(readFileSync(resolve(root, SOURCE), 'utf8')), integratedVaultSHA256: hash(base),
    hooks: declared.map(([name, before, after]) => ({ name, before, after, beforeSHA256: hash(before), afterSHA256: hash(after) })) } };
}
function verify(recorded, expected) {
  if (JSON.stringify(recorded) !== JSON.stringify(expected)) fail('source, manifest or integrated image');
}
export function applyTreatmentSyncHydrationDelta(base, root = ROOT) {
  const built = build(base, root);
  verify(JSON.parse(readFileSync(resolve(root, MANIFEST), 'utf8')), built.manifest); return built.source;
}
export function restoreTreatmentSyncHydrationBaseline(source, root = ROOT) {
  if (!source.includes(START)) return source;
  if (hash(source) !== JSON.parse(readFileSync(resolve(root, MANIFEST), 'utf8')).integratedVaultSHA256) fail('unexpected integrated image');
  const integrated = source;
  for (const [name, before, after] of hooks(root).reverse()) source = once(source, after, before, name);
  const built = build(source, root);
  verify(JSON.parse(readFileSync(resolve(root, MANIFEST), 'utf8')), built.manifest);
  if (built.source !== integrated) fail('round trip differs'); return source;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, input, output] = process.argv.slice(2);
  if (command === '--build' && input && output && process.argv.length === 5) {
    const built = build(readFileSync(resolve(input), 'utf8'), ROOT);
    writeFileSync(resolve(ROOT, MANIFEST), JSON.stringify(built.manifest, null, 2) + '\n');
    writeFileSync(resolve(output), built.source);
  } else if (command === undefined) {
    const source = readFileSync(resolve(ROOT, 'vilda_vault.js'), 'utf8');
    if (applyTreatmentSyncHydrationDelta(restoreTreatmentSyncHydrationBaseline(source)) !== source) fail('round trip differs');
    process.stdout.write('Treatment sync hydration: exact outer Vault layer verified.\n');
  } else fail('usage: node tools/treatment-sync-hydration-vault-delta.mjs [--build BASE_FILE OUTPUT_FILE]');
}
