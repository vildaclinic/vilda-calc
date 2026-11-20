// Isolated diagnostic preparation; never imported by the application.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ownDirectory = path.dirname(fileURLToPath(import.meta.url));
const blocks = JSON.parse(fs.readFileSync(path.join(ownDirectory, 'full-failure-insertion-blocks.json'), 'utf8'));
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const check = (value, message) => { if (!value) throw Error(message); };
const nativeSHA = 'a32e54d2954d4fbfa6778688ea8841dac00147a20e343dc44c6aab40b9601210';

export function buildHarness(original, mode, target) {
  check(['native', 'refusal'].includes(mode), 'Unknown diagnostic mode');
  check(sha(original) === '7adac27a0c1bed2005059d613bd756ef4f9226db6218348d08a89b80b8079607', 'Original growth spec drift');
  const start = original.indexOf('async function expectGhPortalReturned(frame, dialog) {');
  const end = original.indexOf('\nfor (const viewport', start);
  check(start >= 0 && end > start, 'Original failure helper boundaries changed');
  let helper = original.slice(start, end);
  const insertions = [
    ['    const diagnostic = await frame.evaluate(() => ({\n', blocks.openTry, 'before'],
    ["      status: document.getElementById('vhomeGrowthDraftStatus')?.textContent,\n", blocks.newField, 'after'],
    ['    throw error;\n', blocks.closeTry, 'before'],
  ];
  for (const [anchor, added, position] of insertions) {
    check(helper.split(anchor).length - 1 === 1, 'Failure-only insertion anchor drift');
    helper = helper.replace(anchor, position === 'before' ? added + anchor : anchor + added);
  }
  const native = original.slice(0, start) + helper + original.slice(end);
  check(sha(native) === nativeSHA, 'Approved full-failure diagnostic bytes changed');
  let reverseNative = native;
  for (const [, block] of insertions) {
    check(reverseNative.split(block).length - 1 === 1, 'Failure-only reverse block drift');
    reverseNative = reverseNative.replace(block, '');
  }
  check(reverseNative === original, 'Full-failure diagnostic cannot reverse to original');
  const nativeProof = {
    approvedFailureOnlySHA256: nativeSHA,
    addedLines: native.split('\n').length - original.split('\n').length,
    removedLines: 0,
    changesOnlyExistingErrorHelperAfterOriginalAssertionFailure: true,
    originalAllDefinitionsAndAssertionsOutsideHelperByteExact: true,
    reverseOriginalSpecByteExact: true,
    nativeJobAddsSuccessPathHooksMarkersRoutes: false,
  };
  if (mode === 'native') return { body: native, proof: { mode, originalSHA256: sha(original), generatedSHA256: sha(native), ...nativeProof } };

  let value = native;
  const changes = [];
  function replace(old, next, label) {
    check(value.split(old).length - 1 === 1, 'Refusal harness anchor changed: ' + label);
    value = value.replace(old, next);
    changes.push({ old, next, label });
  }
  const header = "import { isTarget as __ghDiagTarget, install as __ghDiagInstall, harvest as __ghDiagHarvest, finish as __ghDiagFinish } from '../diagnostics/gh-session/diagnostic-hooks.mjs';\n";
  value = header + value;
  replace("  await page.addInitScript(() => { window.__VILDA_HOME_WORKSPACE_PREVIEW__ = true; });",
    "  await page.addInitScript(({ diagnostic }) => {\n    window.__VILDA_HOME_WORKSPACE_PREVIEW__ = true;\n    if (diagnostic) window.__vildaGhWriterDiagnosticTarget = true;\n  }, { diagnostic: __ghDiagTarget(test.info()) });", 'existing-initial-init-script-target-marker');
  const genericRoute = "  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());";
  replace(genericRoute, genericRoute + "\n  if (__ghDiagTarget(test.info())) await __ghDiagInstall(page, test.info());", 'target-only-preload-resource-route');
  const enable = "      if (window.__vildaGhWriterDiagnosticTarget === true) {\n        window.__vildaGhWriterObservationEntries = [];\n        window.__vildaGhWriterObservationEnabled = true;\n      }\n";
  replace('      window.__ghSessionAtPortalReturn = null;', enable + '      window.__ghSessionAtPortalReturn = null;', 'late-ram-reset-enable-inside-existing-pre-click-evaluate');
  const beforeF5 = "    await expect.poll(() => frame.evaluate(patient => VildaVault.getPatient(patient).then(row => row.snapshots[0].payload.ghTherapyPoints), id)).toEqual(points);\n    await page.reload({ waitUntil: 'load' }); const restored = await shellFrame(page); await readyForPatient(restored);";
  replace(beforeF5, beforeF5.replace('\n    await page.reload', "\n    if (__ghDiagTarget(test.info())) await __ghDiagHarvest(frame, 'before-original-F5', test.info());\n    await page.reload"), 'harvest-only-after-session-and-vault-ack-before-original-F5');
  const footer = "\ntest.afterEach(async ({ page }, info) => {\n  if (__ghDiagTarget(info)) await __ghDiagFinish(page, info);\n});\n";
  value += footer;
  let reversed = value.slice(header.length, -footer.length);
  for (const change of [...changes].reverse()) {
    check(reversed.split(change.next).length - 1 === 1, 'Refusal harness reverse anchor drift');
    reversed = reversed.replace(change.next, change.old);
  }
  check(reversed === native, 'Refusal harness cannot reverse to approved failure-only spec');
  // Use exact critical boundary anchors, not assertion counts or a rewritten test.
  const criticalStart = '    // Capture the session at the exact moment the ordinary data UI returns.';
  const criticalEnd = '    await expectGhPortalReturned(frame, dialog);';
  const critical = text => text.slice(text.indexOf(criticalStart), text.indexOf(criticalEnd));
  check(critical(value).replace(enable, '') === critical(original), 'Original critical save block changed beyond RAM reset/enable');
  check((critical(value).match(/await frame\.evaluate\(/g) || []).length === 1, 'Critical pre-click round trip count changed');
  return { body: value, proof: { mode, originalSHA256: sha(original), generatedSHA256: sha(value), ...nativeProof,
    reverseToApprovedFailureOnlySpecByteExact: true, changeLabels: changes.map(item => item.label),
    originalCriticalPreclickFrameEvaluateCalls: 1, diagnosticCriticalPreclickFrameEvaluateCalls: 1,
    allOriginalActionsAndAssertionsRetained: true, nativeWriterInvocationNotWrapped: true,
    target, noExtraAwaitBeforeRealPointSave: true,
    bounds: 'V3 setup routes/source layout/scalar labels/after-acknowledgement harvest change timing. A false instrumented guard can log/allocate before a later accepted fallback and successful write; there is no whole-successful-write absence-of-observation guarantee. No runtime fix or release claim.' } };
}
