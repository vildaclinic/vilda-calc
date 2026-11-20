// Isolated, fictional-data diagnosis only. Never import this from application code.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const originalSHA = '0e805e7f0a95103176e3d46d30a3f747a6f16eef9fb7d81ee4893c6d60667c0c';
const observerSHA = '6161d3c8ef3d03ca1defb209dc94be0e90f88045763c93d130d60a77d4596359';
const targetTitle = 'home A2: native GH portal cancels purely and saves/imports the original therapy point · 390';
const output = path.join(process.env.RUNNER_TEMP || '', 'gh-session-diagnostic');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const routeHits = new Map();

export function isTarget(info) {
  return info.project.name === 'home-workspace-webkit' && info.title === targetTitle;
}

function key(info) { return `${sha(info.title).slice(0, 16)}-retry${info.retry}`; }
function write(info, phase, value) {
  fs.writeFileSync(path.join(output, `${key(info)}-${phase}.json`), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
}

export async function install(page, info) {
  if (!isTarget(info)) throw Error('Diagnostic route requested for another case');
  const observer = fs.readFileSync(path.join(output, 'observer.js'), 'utf8');
  if (sha(observer) !== observerSHA) throw Error('Approved observer body drift');
  const hits = [];
  routeHits.set(key(info), hits);
  // Registered after the original generic route, as in the approved local probe.
  await page.route('**/vilda_data_import_export.js*', async route => {
    const request = route.request(), target = new URL(request.url());
    const frameURL = request.frame().url();
    if (target.origin !== 'http://127.0.0.1:4173' || target.pathname !== '/vilda_data_import_export.js'
      || !new URL(frameURL || 'about:blank').pathname.endsWith('/index.html')) return route.fallback();
    if (target.searchParams.get('v') !== '126') throw Error('Native diagnostic resource version drift');
    const response = await route.fetch();
    const nativeBody = await response.body();
    const hit = { url: request.url(), frameURL, nativeStatus: response.status(), nativeSHA256: sha(nativeBody), observerSHA256: sha(observer) };
    hits.push(hit);
    if (hit.nativeStatus !== 200 || hit.nativeSHA256 !== originalSHA) throw Error('Native diagnostic response drift');
    await route.fulfill({ response, body: observer });
  });
}

export async function harvest(frame, phase, info) {
  if (!isTarget(info)) throw Error('Diagnostic harvest requested for another case');
  const value = await frame.evaluate(phase => {
    const read = operation => {
      try { return operation(); }
      catch (error) { return { readError: String(error.code || error.message || error) }; }
    };
    const vault = window.VildaVault, data = window.VildaDataImportExport, persistence = window.VildaPersistence;
    const user = vault?.getCurrentUser?.();
    // Only this fixture's ephemeral fictional account may enter a diagnostic artifact.
    if (!user || user.label !== 'Fikcyjny sejf testu panelu siatek') throw Error('Fictional diagnostic account unavailable');
    const mainSession = read(() => persistence.readMainSession());
    const payload = read(() => data.captureCurrentUserDataReadOnly());
    const primitive = value => value == null || ['string', 'number', 'boolean'].includes(typeof value)
      ? value ?? null : '[non-primitive omitted]';
    return {
      phase, atISO: new Date().toISOString(), atPerformance: performance.now(), location: location.href,
      entries: read(() => window.__vildaGhWriterObservationEntries || []),
      enabled: window.__vildaGhWriterObservationEnabled === true,
      // Keep every clinical and native metadata key and original JSON field order.
      mainSession, mainSessionJSON: JSON.stringify(mainSession), payload, payloadJSON: JSON.stringify(payload),
      moduleGH: read(() => persistence.readModuleJSON('GH_THERAPY_POINTS', [])), windowGH: window.ghTherapyPoints,
      readiness: read(() => data.getSaveReadiness()), paused: read(() => data.isMainSessionAutosavePaused()),
      suppressed: read(() => persistence.isAutosaveSuppressed()), restorePending: read(() => data.isMainSessionRestorePending()),
      applySequence: read(() => data.getApplyLoadedDataSequence()),
      account: { userId: primitive(user.userId), label: primitive(user.label) },
      vaultUnlocked: read(() => vault.isUnlocked()),
      patientId: read(() => sessionStorage.getItem('vildaCurrentPatientId')),
      panel: { owner: read(() => window.VildaPanelPacjent.wlasciciel()), stale: read(() => window.VildaPanelPacjent.nieaktualny()), canWriteSession: read(() => window.VildaPanelPacjent.canWriteSession()) },
      pro: { access: read(() => window.VildaProAccess.hasAccess()), authBootReady: read(() => window.VildaAuthUI.isBootReady()) },
      saveState: read(() => window.VildaSaveStatusIndicator.getState()),
      mainFields: Object.fromEntries(['age', 'ageMonths', 'sex', 'height', 'weight', 'firstName', 'lastName', 'dobInput', 'resultsModeToggle', 'isDoctor', 'pwzNumber'].map(id => {
        const node = document.getElementById(id);
        return [id, node ? { value: node.value, checked: node.checked, disabled: node.disabled } : null];
      })),
      flags: Object.fromEntries(['__vildaPersistRestoring', '__vildaLustroWpis', '__vildaPersistPauseUntil', '__vildaPersistClearUntil', '__vildaSuspendIntakeUserReset', '__vildaSuspendAdvIntakeSync', '__vildaSuspendGrowthHistoryCrossSync', '__vildaSuppressGhAdvancedImportUntil', 'hasUserModifiedAfterLoad'].map(name => [name, primitive(window[name])])),
      dialog: { open: document.getElementById('vhomeGrowthDialog')?.open, tabsHidden: document.querySelector('#vhomeGrowthDialog .vhome-growth-tabs')?.hidden,
        panelPresent: !!document.getElementById('ghZWierszaPanel'), status: document.getElementById('vhomeGrowthDraftStatus')?.textContent,
        portalReturnSession: window.__ghSessionAtPortalReturn ?? null },
    };
  }, phase);
  const hits = routeHits.get(key(info)) || [];
  const entriesObserved = value.enabled && Array.isArray(value.entries) && value.entries.length > 0;
  const result = { kind: 'INSTRUMENTED_FICTIONAL_DIAGNOSTIC_NOT_RELEASE_GATE', phase, status: info.status, retry: info.retry,
    evidenceStatus: hits.length > 0 && entriesObserved ? 'OBSERVED_NATIVE_WRITER_PATH_NOT_FIX_PROOF' : 'INCONCLUSIVE',
    entryCapReached: Array.isArray(value.entries) && value.entries.length >= 200,
    frameURL: frame.url(), routeHits: hits, value };
  write(info, phase, result);
  await info.attach('instrumented-native-gh-' + phase, { body: JSON.stringify(result), contentType: 'application/json' });
}

export async function finish(page, info) {
  if (!isTarget(info)) return;
  const hits = routeHits.get(key(info)) || [];
  write(info, 'route-hits', { evidenceStatus: hits.length ? 'ROUTE_OBSERVED_REQUIRES_NONEMPTY_WRITER_PHASE_LOG' : 'INCONCLUSIVE', hits });
  for (const frame of page.frames()) {
    if (!new URL(frame.url() || 'about:blank').pathname.endsWith('/index.html')) continue;
    try { await harvest(frame, 'after-each', info); }
    catch (error) { write(info, 'after-each-read-error', { evidenceStatus: 'INCONCLUSIVE', error: String(error.message || error), frameURL: frame.url() }); }
  }
}
