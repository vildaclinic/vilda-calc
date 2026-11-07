import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Source for the narrow persistence boundary in the deployed importer. It does
// not select a diet, change its criteria, or populate the clinical selector.
export const pendingDietRestoreSource = String.raw`/* P-DIET-PENDING-RESTORE: source tools/patch-diet-pending-session-restore.mjs */
let vildaPendingDietRestore = null;
function vildaClearPendingDietRestore() {
  if (vildaPendingDietRestore && vildaPendingDietRestore.observer) vildaPendingDietRestore.observer.disconnect();
  vildaPendingDietRestore = null;
}
function vildaResetIncomingDietRestore(plan) {
  const pending = vildaPendingDietRestore;
  // Only retire the manual marker carried by our unresolved restore. A partial
  // session without a plan must leave an already initialized selector alone.
  if (!plan && pending && r.document.getElementById("dietLevel") === pending.field && pending.field.options.length === 0) {
    r.__vildaDietLevelTouched = false;
    r.__vildaDietLevelDefault = null;
  }
  vildaClearPendingDietRestore();
}
function vildaDietSelectorInitialized(field, records) {
  return field.options.length > 0 || records.some(record => Array.from(record.addedNodes || []).some(node =>
    node && (node.nodeName === "OPTION" || node.nodeName === "OPTGROUP" || typeof node.querySelector === "function" && node.querySelector("option"))));
}
function vildaRememberPendingDietRestore(plan) {
  vildaClearPendingDietRestore();
  const field = r.document && r.document.getElementById("dietLevel");
  if (!field || !field.options || field.options.length !== 0 || !plan || typeof plan.dietLevel !== "string" || !plan.dietLevel) return;
  const pending = { field, dietLevel: plan.dietLevel, dietaWybrana: plan.dietaWybrana === true, observer: null };
  vildaPendingDietRestore = pending;
  // Once the selector is initialized, its own value is authoritative, even if
  // the plan later removes all options. Never resurrect an earlier snapshot.
  if (typeof r.MutationObserver === "function") {
    pending.observer = new r.MutationObserver(function (records) {
      if (vildaPendingDietRestore !== pending) return;
      if (vildaDietSelectorInitialized(field, records)) vildaClearPendingDietRestore();
    });
    pending.observer.observe(field, { childList: true, subtree: true });
  }
}
function vildaDietPlanForCapture(readOnly) {
  const field = r.document && r.document.getElementById("dietLevel");
  // A synchronous save can precede the observer microtask after options have
  // already appeared and disappeared. Only the writable collector drains it.
  const waiting = vildaPendingDietRestore;
  if (!readOnly && waiting && waiting.observer && vildaDietSelectorInitialized(waiting.field, waiting.observer.takeRecords())) {
    vildaClearPendingDietRestore();
  }
  const pending = vildaPendingDietRestore;
  if (pending && field === pending.field && field.options && field.options.length === 0) {
    return { dietLevel: pending.dietLevel, dietaWybrana: pending.dietaWybrana };
  }
  // The read-only save-status collector never consumes restoration state.
  // A normal capture or the initialization observer ends the pending phase.
  if (pending && !readOnly) vildaClearPendingDietRestore();
  return { dietLevel: field && field.value || null, dietaWybrana: r.__vildaDietLevelTouched === true };
}
/* P-DIET-PENDING-RESTORE: end */
`;

function once(source, before, after) {
  if (source.split(before).length !== 2) throw new Error('Expected one importer integration anchor: ' + before.slice(0, 90));
  return source.replace(before, after);
}
export function patchDietPendingSessionRestore(source) {
  if (source.includes('/* P-DIET-PENDING-RESTORE: source')) return source;
  source = once(source, 'function vildaDietaPoWczytaniu(p){', pendingDietRestoreSource + 'function vildaDietaPoWczytaniu(p){vildaRememberPendingDietRestore(p);');
  source = once(source, 'dietLevel:(f("dietLevel")||{}).value||null,/* P-DIETA-AUDYT2 A1 */dietaWybrana:r.__vildaDietLevelTouched===!0', '...vildaDietPlanForCapture(readOnlyCapture)');
  source = once(source, 'function Rt(e){invalidateSaveScope();saveClearDepth+=1;try{beginGrowthHistoryRestore(null);', 'function Rt(e){invalidateSaveScope();saveClearDepth+=1;try{beginGrowthHistoryRestore(null);vildaClearPendingDietRestore();');
  source = once(source, 'function sa(e){clearIncomingSgaUiState(e);Bdob0();', 'function sa(e){clearIncomingSgaUiState(e);vildaClearPendingDietRestore();Bdob0();');
  source = once(source, 'if(!e||typeof e!="object")return!1;ownSaveBlankAgeWitness=null;const applySequence=', 'if(!e||typeof e!="object")return!1;vildaResetIncomingDietRestore(e.plan);ownSaveBlankAgeWitness=null;const applySequence=');
  source = once(source, 'rememberIncomingMainSessionCarry(u);/* P-ODTWORZ-WIEK:', 'vildaResetIncomingDietRestore(u.plan);rememberIncomingMainSessionCarry(u);/* P-ODTWORZ-WIEK:');
  return source;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = resolve(process.argv[2] || 'vilda_data_import_export.js');
  writeFileSync(target, patchDietPendingSessionRestore(readFileSync(target, 'utf8')));
}
