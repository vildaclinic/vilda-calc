/** Reproduce the presentation-only restoration extension of audyt 26fb0b34.
 * No medical formula, model assignment or history synchronization is removed.
 * Exact, unique anchors fail closed when upstream changes. Every newly added
 * helper is readable here and in its deployment artifact; no minifier needed.
 * Run: node tools/apply_restore_result_batching.mjs [--check]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const patches = [
  {
    "file": "vilda_html.js",
    "label": "Readable synchronous result batch API",
    "before": "const S={version:A,escapeHtml:c",
    "after": "\n/* P-ODTWARZANIE-WYNIKOW: only explicit synchronous restoration scopes batch\n * presentation. Calculations, model commits, history pairing and autosave guards\n * keep their original order. Ordinary calls (including user edits) run at once.\n * A result callback includes HTML construction, DOM replacement and its bindings.\n * No timer, frame, Promise or stored patient payload can outlive the restore. */\nlet resultRefreshDepth = 0;\nlet resultRefreshFlushing = false;\nconst resultRefreshQueue = new Map();\nfunction refreshResult(key, callback, element) {\n  if (!resultRefreshDepth && !resultRefreshFlushing) return callback();\n  resultRefreshQueue.set(key, function () {\n    // A later synchronous restore may replace a result container altogether.\n    if (!element || element.isConnected !== false) return callback();\n  });\n}\nfunction flushResultRefreshes() {\n  resultRefreshFlushing = true;\n  let failed = false, firstError;\n  try {\n    while (resultRefreshQueue.size) {\n      const [key, callback] = resultRefreshQueue.entries().next().value;\n      resultRefreshQueue.delete(key);\n      try { callback(); }\n      catch (error) { if (!failed) { failed = true; firstError = error; } }\n    }\n  } finally { resultRefreshFlushing = false; }\n  // Independent result cards still finish if one renderer fails.\n  if (failed) throw firstError;\n}\nfunction withResultRefreshBatch(callback) {\n  resultRefreshDepth += 1;\n  let value, failed = false, originalError;\n  try { value = callback(); }\n  catch (error) { failed = true; originalError = error; }\n  finally { resultRefreshDepth -= 1; }\n  if (!resultRefreshDepth && !resultRefreshFlushing) {\n    try { flushResultRefreshes(); }\n    catch (error) { if (!failed) { failed = true; originalError = error; } }\n  }\n  // Preserve the restore's own exception; rendering must not mask it.\n  if (failed) throw originalError;\n  return value;\n}\nconst S={version:A,withResultRefreshBatch:withResultRefreshBatch,refreshResult:refreshResult,escapeHtml:c"
  },
  {
    "file": "vilda_persist_runtime.js",
    "label": "Scope shared restore including synchronous finalizers",
    "before": "function Ye(){/* P-POWLOKA-ID",
    "after": "function Ye(){\n  const html = window.VildaHtml;\n  return html && typeof html.withResultRefreshBatch === \"function\"\n    ? html.withResultRefreshBatch(restoreSharedStateImmediately)\n    : restoreSharedStateImmediately();\n}\nfunction restoreSharedStateImmediately(){/* P-POWLOKA-ID"
  },
  {
    "file": "vilda_data_import_export.js",
    "label": "Scope only main-session apply; normal loads retain immediate presentation",
    "before": "function Ft(e,t){const a=t&&typeof t==\"object\"?t:{},o=r.document||null",
    "after": "function Ft(e,t){\n  if (e && typeof e === \"object\" && !(t && t.isSessionRestore === true)) cancelPendingMainSessionRestore();\n  e=currentClcrForSessionRestore(e,t);\n  const html = r.VildaHtml;\n  return t && t.isSessionRestore === true && html && typeof html.withResultRefreshBatch === \"function\"\n    ? html.withResultRefreshBatch(function () { return applyLoadedDataImmediately(e,t); })\n    : applyLoadedDataImmediately(e,t);\n}\nfunction applyLoadedDataImmediately(e,t){const a=t&&typeof t==\"object\"?t:{},o=r.document||null"
  },
  {
    "file": "vilda_advanced_growth.js",
    "label": "Presentation helper with legacy immediate fallback",
    "before": "function br(e){",
    "after": "function refreshAdvancedResult(callback, element) {\n  const html = i.VildaHtml;\n  return html && typeof html.refreshResult === \"function\"\n    ? html.refreshResult(\"advanced-growth-result\", callback, element)\n    : callback();\n}\nfunction br(e){"
  },
  {
    "file": "vilda_advanced_growth.js",
    "label": "Final clear replaces any earlier queued result",
    "before": "if(!(!n||t.clearResults===!1))try{typeof t.clearHtml==\"function\"?t.clearHtml(n):pa(n)}catch(a){R(\"vilda_advanced_growth:lifecycle:clear-results\",a)}}",
    "after": "if(!(!n||t.clearResults===!1))refreshAdvancedResult(function(){try{typeof t.clearHtml==\"function\"?t.clearHtml(n):pa(n)}catch(a){R(\"vilda_advanced_growth:lifecycle:clear-results\",a)}},n)}"
  },
  {
    "file": "vilda_advanced_growth.js",
    "label": "Model commit stays immediate; whole presentation block is queued",
    "before": "if(ta(Mr,{global:n,updateStabilizationEligibility:typeof T==\"function\"?T:null,refreshEstimatedIntakeVisibility:typeof F==\"function\"?F:null}),r){let C=\"\";",
    "after": "ta(Mr,{global:n,updateStabilizationEligibility:typeof T==\"function\"?T:null,refreshEstimatedIntakeVisibility:typeof F==\"function\"?F:null});refreshAdvancedResult(function(){if(r){let C=\"\";"
  },
  {
    "file": "vilda_advanced_growth.js",
    "label": "Bindings/pulse are inside result callback; lifecycle remains immediate",
    "before": "Ie(r,\"danger\")):r.style.borderColor=\"var(--primary)\"}na({global:n,updateProfessionalSummary:!!r",
    "after": "Ie(r,\"danger\")):r.style.borderColor=\"var(--primary)\"}},r);na({global:n,updateProfessionalSummary:!!r"
  },
  {
    "file": "growth-basic-module.js",
    "label": "Basic presentation helper with legacy immediate fallback",
    "before": "function z(){const e=l(\"basicGrowthResults\");",
    "after": "function refreshBasicResult(callback, element) {\n  const html = window.VildaHtml;\n  return html && typeof html.refreshResult === \"function\"\n    ? html.refreshResult(\"basic-growth-result\", callback, element)\n    : callback();\n}\nfunction z(){const e=l(\"basicGrowthResults\");"
  },
  {
    "file": "growth-basic-module.js",
    "label": "Invalid age clears final view without stale queued child result",
    "before": "window.basicGrowthData=null,e&&(q(e),e.style.borderColor=\"\",e.style.fontSize=\"\"),W();return",
    "after": "window.basicGrowthData=null,refreshBasicResult(function(){e&&(q(e),e.style.borderColor=\"\",e.style.fontSize=\"\")},e),W();return"
  },
  {
    "file": "growth-basic-module.js",
    "label": "Basic model assignment remains immediate",
    "before": "if(window.basicGrowthData={measurements:s,growthVelocity:u,growthVelocityUsedLastYear:f,growthVelocityContext:p,growthVelocityGapM:A,tempo:Tm0,currentAgeMonths:n,currentHeight:r,currentWeight:i,sex:a,name:d||\"\",isLosingGrowth:L,isSlowVelocity:V},e){let w=\"\";",
    "after": "window.basicGrowthData={measurements:s,growthVelocity:u,growthVelocityUsedLastYear:f,growthVelocityContext:p,growthVelocityGapM:A,tempo:Tm0,currentAgeMonths:n,currentHeight:r,currentWeight:i,sex:a,name:d||\"\",isLosingGrowth:L,isSlowVelocity:V};refreshBasicResult(function(){if(e){let w=\"\";"
  },
  {
    "file": "growth-basic-module.js",
    "label": "Basic pulse belongs to rendered result; cross-sync remains immediate",
    "before": "else e.style.borderColor=\"var(--primary)\"}if(Z(),R())",
    "after": "else e.style.borderColor=\"var(--primary)\"}},e);if(Z(),R())"
  },
  {
    "file": "vilda_data_import_export.js",
    "label": "Readable narrowly scoped owner/auth restoration barrier",
    "before": "function Fe(e){const t=pe(e);if(Ke||!ge(t))return!1;Ke=!0;",
    "after": "/* P-ODTWARZANIE-WYNIKOW: a saved patient's full form must not restore\n * against a vault still being resumed by AuthUI. The examination carrier correctly\n * rejects a locked owner; reading it during that interval would erase the freshly\n * restored examination. Keep Ke=false so the existing pre-restore write barrier\n * also protects the complete session. No patient payload is captured here.\n * Once boot settles (including failure), the original restore rules apply. */\nlet pendingAuthMainSession = null;\nconst mainSessionBoundVaults = new WeakSet();\nfunction mainSessionPatientId() {\n  try {\n    if (r.sessionStorage && typeof r.sessionStorage.getItem === \"function\")\n      return r.sessionStorage.getItem(\"vildaCurrentPatientId\") || null;\n  } catch (_) { /* Keep the existing window fallback when storage is unavailable. */ }\n  return typeof r._vildaCurrentPatientId === \"string\" ? r._vildaCurrentPatientId || null : null;\n}\nfunction mainSessionPendingAuth() {\n  try {\n    const vault = r.VildaVault, auth = r.VildaAuthUI, patientId = mainSessionPatientId();\n    return patientId && vault && typeof vault.isUnlocked === \"function\"\n      && auth && typeof auth.isBootReady === \"function\"\n      && auth.isBootReady() === false && vault.isUnlocked() === false\n      ? { patientId: patientId, vault: vault } : null;\n  } catch (_) { return null; }\n}\nfunction cancelPendingMainSessionRestore() {\n  const pending = pendingAuthMainSession;\n  if (!pending) return;\n  pendingAuthMainSession = null;\n  pending.cleanup.forEach(function (cleanup) { try { cleanup(); } catch (_) {} });\n  if (pending.frame !== null) {\n    try {\n      if (pending.usesFrame && typeof r.cancelAnimationFrame === \"function\") r.cancelAnimationFrame(pending.frame);\n      else if (!pending.usesFrame && typeof r.clearTimeout === \"function\") r.clearTimeout(pending.frame);\n    } catch (_) { /* The callback also verifies its token before doing any work. */ }\n  }\n}\nfunction deferMainSessionUntilAuth(options) {\n  const context = mainSessionPendingAuth();\n  if (!context) return false;\n  const doc = r.document;\n  if (!doc || typeof doc.addEventListener !== \"function\") return false;\n  if (pendingAuthMainSession && pendingAuthMainSession.vault === context.vault\n      && pendingAuthMainSession.patientId === context.patientId\n      && pendingAuthMainSession.sequence === vildaApplyLoadedDataSequence) {\n    pendingAuthMainSession.options = options;\n    return true;\n  }\n  cancelPendingMainSessionRestore();\n  const pending = { vault: context.vault, patientId: context.patientId,\n    sequence: vildaApplyLoadedDataSequence, options: options, cleanup: [], frame: null, usesFrame: false, suspended: false };\n  pendingAuthMainSession = pending;\n  function cancel() { if (pendingAuthMainSession === pending) cancelPendingMainSessionRestore(); }\n  function resume() {\n    pending.frame = null;\n    if (pendingAuthMainSession !== pending || pending.suspended) return;\n    if (Ke || r.VildaVault !== pending.vault || mainSessionPatientId() !== pending.patientId\n        || vildaApplyLoadedDataSequence !== pending.sequence) { cancel(); return; }\n    if (mainSessionPendingAuth()) return;\n    const latestOptions = pending.options;\n    cancel();\n    // Read the current session only now. A newer load or clear always wins.\n    Fe(latestOptions);\n  }\n  function requestResume() {\n    if (pendingAuthMainSession !== pending || pending.suspended || pending.frame !== null) return;\n    pending.usesFrame = typeof r.requestAnimationFrame === \"function\";\n    pending.frame = pending.usesFrame ? r.requestAnimationFrame(resume) : r.setTimeout(resume, 0);\n  }\n  pending.requestResume = requestResume;\n  function listen(target, type, callback) {\n    if (!target || typeof target.addEventListener !== \"function\") return;\n    target.addEventListener(type, callback);\n    pending.cleanup.push(function () {\n      if (typeof target.removeEventListener === \"function\") target.removeEventListener(type, callback);\n    });\n  }\n  try {\n    listen(doc, \"vilda:auth-boot-settled\", requestResume);\n    listen(doc, \"vilda:patient-loaded\", cancel);\n    listen(doc, \"vilda:user-state-cleared\", cancel);\n    listen(r, \"vilda:user-state-cleared\", cancel);\n    listen(r, \"pagehide\", function () {\n      pending.suspended = true;\n      if (pending.frame !== null) {\n        if (pending.usesFrame && typeof r.cancelAnimationFrame === \"function\") r.cancelAnimationFrame(pending.frame);\n        else if (!pending.usesFrame && typeof r.clearTimeout === \"function\") r.clearTimeout(pending.frame);\n        pending.frame = null;\n      }\n    });\n    listen(r, \"pageshow\", function () { pending.suspended = false; requestResume(); });\n    // Vault subscriptions have no unsubscribe API. Bind once per vault and keep\n    // only the current operation token, never the restored patient payload.\n    if (!mainSessionBoundVaults.has(context.vault)) {\n      mainSessionBoundVaults.add(context.vault);\n      if (typeof context.vault.onUnlock === \"function\") context.vault.onUnlock(function () {\n        const active = pendingAuthMainSession;\n        if (active && active.vault === context.vault) active.requestResume();\n      });\n      if (typeof context.vault.onLock === \"function\") context.vault.onLock(function () {\n        if (pendingAuthMainSession && pendingAuthMainSession.vault === context.vault)\n          cancelPendingMainSessionRestore();\n      });\n    }\n    // Covers an unlock/readiness change that happened while listeners attached.\n    if (!mainSessionPendingAuth()) requestResume();\n  } catch (error) {\n    cancel();\n    l(\"vilda_data_import_export:main-session:auth-wait\", error);\n    return false;\n  }\n  return true;\n}\nfunction Fe(e){const t=pe(e);if(Ke||!ge(t))return!1;if(deferMainSessionUntilAuth(t))return!1;cancelPendingMainSessionRestore();Ke=!0;"
  },
  {
    "file": "vilda_data_import_export.js",
    "label": "Explicit session clear cancels a deferred startup restore",
    "before": "function re(e){pendingIncomingMainSessionCarry=null;pendingSynthesizedMainPlanPal=null;pendingNewMeasurementBasicArchive=null;try{$&&",
    "after": "function re(e){pendingIncomingMainSessionCarry=null;pendingSynthesizedMainPlanPal=null;pendingNewMeasurementBasicArchive=null;cancelPendingMainSessionRestore();try{$&&"
  },
  {
    "file": "vilda_auth_ui.js",
    "label": "Publish final boot completion after readiness is true, including failure and guest paths",
    "before": "finally{authBootReady=true}}",
    "after": "finally{\n  authBootReady=true;\n  // The existing auth-hidden/state-settled signals precede this flag. Consumers\n  // waiting for startup restoration need the completed boundary exactly once.\n  try {\n    if(i.document&&typeof i.CustomEvent===\"function\")\n      i.document.dispatchEvent(new i.CustomEvent(\"vilda:auth-boot-settled\",{detail:{ready:true}}));\n  } catch (_) { /* A listener must not change the result of authentication. */ }\n}}"
  },
  {
    "file": "vilda_data_import_export.js",
    "label": "Expose only pending restoration readiness for strict live-chart ownership gating",
    "before": "restoreMainSessionIfAny:Fe,hasMeaningfulMainSessionData:Re",
    "after": "restoreMainSessionIfAny:Fe,isMainSessionRestorePending:function(){return pendingAuthMainSession!==null},hasMeaningfulMainSessionData:Re"
  },
  {
    "file": "vilda_data_import_export.js",
    "label": "Publish completed main-session restoration without polling timers",
    "before": "function Mt(e,t){",
    "after": "function dispatchMainSessionRestored() {\n  try {\n    if (r.document && typeof r.document.dispatchEvent === \"function\" && typeof r.CustomEvent === \"function\")\n      r.document.dispatchEvent(new r.CustomEvent(\"vilda:main-session-restored\", { detail: { source: \"main-session\" } }));\n  } catch (error) { l(\"vilda_data_import_export:main-session:restored-event\", error); }\n}\nfunction Mt(e,t){"
  },
  {
    "file": "vilda_data_import_export.js",
    "label": "Completion follows existing flag release, save and professional summary",
    "before": "Gp_o()};try{ae&&clearTimeout(ae)}",
    "after": "Gp_o(),dispatchMainSessionRestored()};try{ae&&clearTimeout(ae)}"
  },
  {
    "file": "vilda_data_import_export.js",
    "label": "Reading an existing main session is not a new shared load; avoid DocPro restoring its older shared copy back over the final form",
    "before": "if(Gp_a(a),tt(),a.isSessionRestore!==!0)try{n(function(){",
    "after": "if(Gp_a(a),a.isSessionRestore!==!0&&tt(),a.isSessionRestore!==!0)try{n(function(){"
  }
];
// CHECK-ONLY recognition for the exact startup-restoration lifecycle added after
// this presentation overlay. These are not apply replacements: the original
// 18 before/after definitions above remain the reproducible historical patch.
// Each complete current anchor must be unique, with neither old form present.
const currentCheckVariants = new Map(
[
  [
    "Scope only main-session apply; normal loads retain immediate presentation",
    {
      "file": "vilda_data_import_export.js",
      "anchor": "function Ft(e,t){\n  if (e && typeof e === \"object\" && !(t && t.isSessionRestore === true)) cancelPendingMainSessionRestore();\n  e=currentClcrForSessionRestore(e,t);\n  const html = r.VildaHtml;\n  const result=t && t.isSessionRestore === true && html && typeof html.withResultRefreshBatch === \"function\"\n    ? html.withResultRefreshBatch(function () { return applyLoadedDataImmediately(e,t); })\n    : applyLoadedDataImmediately(e,t);\n  if(result===true&&!(t&&t.isSessionRestore===true))settleInitialMainSessionRestore(true,\"superseded-load\");\n  return result;\n}\nfunction applyLoadedDataImmediately(e,t){const a=t&&typeof t==\"object\"?t:{},o=r.document||null"
    }
  ],
  [
    "Readable narrowly scoped owner/auth restoration barrier",
    {
      "file": "vilda_data_import_export.js",
      "anchor": "/* P-ODTWARZANIE-WYNIKOW: a saved patient's full form must not restore\n * against a vault still being resumed by AuthUI. The examination carrier correctly\n * rejects a locked owner; reading it during that interval would erase the freshly\n * restored examination. Keep Ke=false so the existing pre-restore write barrier\n * also protects the complete session. No patient payload is captured here.\n * Once boot settles (including failure), the original restore rules apply. */\nlet pendingAuthMainSession = null;\nconst mainSessionBoundVaults = new WeakSet();\nfunction mainSessionPatientId() {\n  try {\n    if (r.sessionStorage && typeof r.sessionStorage.getItem === \"function\")\n      return r.sessionStorage.getItem(\"vildaCurrentPatientId\") || null;\n  } catch (_) { /* Keep the existing window fallback when storage is unavailable. */ }\n  return typeof r._vildaCurrentPatientId === \"string\" ? r._vildaCurrentPatientId || null : null;\n}\nfunction mainSessionPendingAuth() {\n  try {\n    const vault = r.VildaVault, auth = r.VildaAuthUI, patientId = mainSessionPatientId();\n    return patientId && vault && typeof vault.isUnlocked === \"function\"\n      && auth && typeof auth.isBootReady === \"function\"\n      && auth.isBootReady() === false && vault.isUnlocked() === false\n      ? { patientId: patientId, vault: vault } : null;\n  } catch (_) { return null; }\n}\nfunction cancelPendingMainSessionRestore() {\n  const pending = pendingAuthMainSession;\n  if (!pending) return;\n  pendingAuthMainSession = null;\n  pending.cleanup.forEach(function (cleanup) { try { cleanup(); } catch (_) {} });\n  if (pending.frame !== null) {\n    try {\n      if (pending.usesFrame && typeof r.cancelAnimationFrame === \"function\") r.cancelAnimationFrame(pending.frame);\n      else if (!pending.usesFrame && typeof r.clearTimeout === \"function\") r.clearTimeout(pending.frame);\n    } catch (_) { /* The callback also verifies its token before doing any work. */ }\n  }\n}\nfunction deferMainSessionUntilAuth(options) {\n  const context = mainSessionPendingAuth();\n  if (!context) return false;\n  const doc = r.document;\n  if (!doc || typeof doc.addEventListener !== \"function\") return false;\n  if (pendingAuthMainSession && pendingAuthMainSession.vault === context.vault\n      && pendingAuthMainSession.patientId === context.patientId\n      && pendingAuthMainSession.sequence === vildaApplyLoadedDataSequence) {\n    pendingAuthMainSession.options = options;\n    return true;\n  }\n  cancelPendingMainSessionRestore();\n  const pending = { vault: context.vault, patientId: context.patientId,\n    sequence: vildaApplyLoadedDataSequence, options: options, cleanup: [], frame: null, usesFrame: false, suspended: false };\n  pendingAuthMainSession = pending;\n  function cancel() { if (pendingAuthMainSession === pending) cancelPendingMainSessionRestore(); }\n  function resume() {\n    pending.frame = null;\n    if (pendingAuthMainSession !== pending || pending.suspended) return;\n    if (Ke || r.VildaVault !== pending.vault || mainSessionPatientId() !== pending.patientId\n        || vildaApplyLoadedDataSequence !== pending.sequence) { cancel(); return; }\n    if (mainSessionPendingAuth()) return;\n    const latestOptions = pending.options;\n    cancel();\n    // Read the current session only now. A newer load or clear always wins.\n    Fe(latestOptions);\n  }\n  function requestResume() {\n    if (pendingAuthMainSession !== pending || pending.suspended || pending.frame !== null) return;\n    pending.usesFrame = typeof r.requestAnimationFrame === \"function\";\n    pending.frame = pending.usesFrame ? r.requestAnimationFrame(resume) : r.setTimeout(resume, 0);\n  }\n  pending.requestResume = requestResume;\n  function listen(target, type, callback) {\n    if (!target || typeof target.addEventListener !== \"function\") return;\n    target.addEventListener(type, callback);\n    pending.cleanup.push(function () {\n      if (typeof target.removeEventListener === \"function\") target.removeEventListener(type, callback);\n    });\n  }\n  try {\n    listen(doc, \"vilda:auth-boot-settled\", requestResume);\n    listen(doc, \"vilda:patient-loaded\", cancel);\n    listen(doc, \"vilda:user-state-cleared\", cancel);\n    listen(r, \"vilda:user-state-cleared\", cancel);\n    listen(r, \"pagehide\", function () {\n      pending.suspended = true;\n      if (pending.frame !== null) {\n        if (pending.usesFrame && typeof r.cancelAnimationFrame === \"function\") r.cancelAnimationFrame(pending.frame);\n        else if (!pending.usesFrame && typeof r.clearTimeout === \"function\") r.clearTimeout(pending.frame);\n        pending.frame = null;\n      }\n    });\n    listen(r, \"pageshow\", function () { pending.suspended = false; requestResume(); });\n    // Vault subscriptions have no unsubscribe API. Bind once per vault and keep\n    // only the current operation token, never the restored patient payload.\n    if (!mainSessionBoundVaults.has(context.vault)) {\n      mainSessionBoundVaults.add(context.vault);\n      if (typeof context.vault.onUnlock === \"function\") context.vault.onUnlock(function () {\n        const active = pendingAuthMainSession;\n        if (active && active.vault === context.vault) active.requestResume();\n      });\n      if (typeof context.vault.onLock === \"function\") context.vault.onLock(function () {\n        if (pendingAuthMainSession && pendingAuthMainSession.vault === context.vault)\n          cancelPendingMainSessionRestore();\n      });\n    }\n    // Covers an unlock/readiness change that happened while listeners attached.\n    if (!mainSessionPendingAuth()) requestResume();\n  } catch (error) {\n    cancel();\n    l(\"vilda_data_import_export:main-session:auth-wait\", error);\n    return false;\n  }\n  return true;\n}\nfunction Fe(e){\n  const t=pe(e);\n  if(Ke)return!1;\n  if(!ge(t)){settleInitialMainSessionRestore(false,\"storage-unavailable\");return!1}\n  if(deferMainSessionUntilAuth(t))return!1;\n  cancelPendingMainSessionRestore();Ke=!0;\n  let a=!1,o=!1,outcome={ready:false,reason:\"restore-failed\"};\n  try{\n    const n=Z();let i=null;\n    if(!n||typeof n.readMainSession!==\"function\"){outcome={ready:false,reason:\"missing-reader\"};return!1}\n    i=n.readMainSession();\n    if(!i){outcome={ready:true,reason:\"empty\"};return!1}\n    if(!Re(i)){outcome=i&&i.version!==1?{ready:false,reason:\"unsupported-session\"}:{ready:true,reason:\"empty\"};return re(t),!1}\n    if(!i||i.version!==1){outcome={ready:false,reason:\"unsupported-session\"};return!1}\n    if((typeof t.anyDataEntered===\"function\"?!!t.anyDataEntered(t):xe(t))&&!Bwczytany0()){\n      /* P-POKWITANIE-KONTRAKT: shared fields may restore before the full guest session.\n       * Only the never-initialized hidden carrier may recover; other fields stay put. */\n      if(r.VildaPubertyAssessmentState)r.VildaPubertyAssessmentState.restoreSessionIfUninitialized(i);\n      outcome={ready:true,reason:\"kept-form\"};return!1;\n    }\n    try{a=!!r.__vildaPersistRestoring;r.__vildaPersistRestoring=!0}catch(p){l(\"vilda_data_import_export:restoreMainSessionIfAny:setFlag\",p)}\n    const d=A(t,\"applyLoadedData\",\"applyLoadedData\");\n    if(typeof d!==\"function\"){l(\"vilda_data_import_export:restoreMainSessionIfAny\",new Error(\"Missing applyLoadedData callback\"));outcome={ready:false,reason:\"missing-apply\"};return!1}\n    ve=!0;\n    const applied=d(i,{isSessionRestore:!0});\n    outcome=applied===false?{ready:false,reason:\"apply-refused\"}:{ready:true,reason:\"restored\"};\n    o=!0;Mt(a,t,outcome);return!0;\n  }catch(n){l(\"vilda_data_import_export:restoreMainSessionIfAny\",n);outcome={ready:false,reason:\"restore-failed\"};return!1}\n  finally{\n    if(!o){ve=!1;try{r.__vildaPersistRestoring=a}catch(n){l(\"vilda_data_import_export:restoreMainSessionIfAny:restoreFlag\",n)}settleInitialMainSessionRestore(outcome.ready,outcome.reason)}\n  }\n}"
    }
  ],
  [
    "Expose only pending restoration readiness for strict live-chart ownership gating",
    {
      "file": "vilda_data_import_export.js",
      "anchor": "restoreMainSessionIfAny:Fe,isMainSessionRestorePending:function(){return pendingAuthMainSession!==null},whenInitialMainSessionRestoreSettled:whenInitialMainSessionRestoreSettled,hasMeaningfulMainSessionData:Re"
    }
  ],
  [
    "Publish completed main-session restoration without polling timers",
    {
      "file": "vilda_data_import_export.js",
      "anchor": "function dispatchMainSessionRestored() {\n  try {\n    if (r.document && typeof r.document.dispatchEvent === \"function\" && typeof r.CustomEvent === \"function\")\n      r.document.dispatchEvent(new r.CustomEvent(\"vilda:main-session-restored\", { detail: { source: \"main-session\" } }));\n  } catch (error) { l(\"vilda_data_import_export:main-session:restored-event\", error); }\n}\nfunction Mt(e,t,initialOutcome){"
    }
  ],
  [
    "Completion follows existing flag release, save and professional summary",
    {
      "file": "vilda_data_import_export.js",
      "anchor": "Gp_o(),dispatchMainSessionRestored();if(initialOutcome)settleInitialMainSessionRestore(initialOutcome.ready,initialOutcome.reason)};try{ae&&clearTimeout(ae)}"
    }
  ]
]);
const pending = new Map();
for (const patch of patches) {
  const source = pending.get(patch.file) ?? await fs.readFile(path.join(root, patch.file), 'utf8');
  const count = needle => source.split(needle).length - 1;
  if (count(patch.after) === 1) { pending.set(patch.file, source); continue; }
  const currentVariant = process.argv.includes('--check') && currentCheckVariants.get(patch.label);
  if (currentVariant && currentVariant.file === patch.file && count(patch.before) === 0 &&
      count(patch.after) === 0 && count(currentVariant.anchor) === 1) {
    pending.set(patch.file, source); continue;
  }
  if (count(patch.before) !== 1 || count(patch.after) !== 0) throw new Error(`Ambiguous artifact anchor: ${patch.file}: ${patch.label}`);
  if (process.argv.includes('--check')) throw new Error(`Unapplied artifact extension: ${patch.file}: ${patch.label}`);
  pending.set(patch.file, source.replace(patch.before, () => patch.after));
}
for (const [file, source] of pending) {
  if (!process.argv.includes('--check')) await fs.writeFile(path.join(root, file), source);
}
console.log(`Restore result extension verified: ${patches.length} exact anchors in ${pending.size} artifacts.`);
