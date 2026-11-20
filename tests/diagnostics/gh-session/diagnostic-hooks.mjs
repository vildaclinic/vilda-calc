// Refusal-stress diagnosis only. Never imported by the application or native-full job.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ownDirectory = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(ownDirectory, 'safety-manifest.json'), 'utf8'));
const output = path.join(process.env.RUNNER_TEMP || '', 'gh-session-diagnostic-refusal');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const routeHits = new Map();
const observedPhases = new Map();

export function isTarget(info) {
  return info.project.name === manifest.target.project && info.title === manifest.target.title;
}
function key(info) {
  if (!Number.isInteger(info.repeatEachIndex) || !Number.isInteger(info.retry)) throw Error('Diagnostic repeat/retry identity unavailable');
  return `${sha(info.project.name + '\n' + info.title).slice(0, 16)}-repeat${info.repeatEachIndex}-retry${info.retry}`;
}
function identity(info) {
  return { project: info.project.name, title: info.title, repeatEachIndex: info.repeatEachIndex, retry: info.retry, workerIndex: info.workerIndex };
}
function write(info, phase, value) {
  fs.writeFileSync(path.join(output, `${key(info)}-${phase}.json`), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
}
export async function install(page, info) {
  if (!isTarget(info)) throw Error('Diagnostic route requested for another case');
  const observer = fs.readFileSync(path.join(output, 'observer.js'), 'utf8');
  if (sha(observer) !== manifest.observerSHA256) throw Error('Approved refusal-only observer drift');
  const hits = [];
  routeHits.set(key(info), hits);
  observedPhases.set(key(info), []);
  await page.route('**/vilda_data_import_export.js*', async route => {
    const request = route.request(), url = new URL(request.url());
    const frameURL = request.frame().url();
    if (url.origin !== manifest.target.origin || url.pathname !== '/vilda_data_import_export.js'
      || new URL(frameURL || 'about:blank').origin !== manifest.target.origin
      || new URL(frameURL || 'about:blank').pathname !== manifest.target.framePath) return route.fallback();
    if (url.search !== '?v=126') throw Error('Native diagnostic resource version drift');
    const response = await route.fetch();
    const nativeBody = await response.body();
    const hit = { ...identity(info), url: request.url(), frameURL, nativeStatus: response.status(), nativeSHA256: sha(nativeBody), observerSHA256: sha(observer) };
    hits.push(hit);
    if (hit.nativeStatus !== 200 || hit.nativeSHA256 !== manifest.originalFiles['vilda_data_import_export.js']) throw Error('Native diagnostic response drift');
    await route.fulfill({ response, body: observer });
    hit.fulfilled = true;
  });
}

export async function harvest(frame, phase, info) {
  if (!isTarget(info)) throw Error('Diagnostic harvest requested for another case');
  const value = await frame.evaluate(phase => {
    const read = operation => {
      try { return { status: 'available', value: operation() }; }
      catch (error) { return { status: 'read-error', error: { name: typeof error?.name === 'string' ? error.name : 'Error', message: typeof error?.message === 'string' ? error.message : 'Read unavailable' } }; }
    };
    const primitive = operation => read(() => {
      const value = operation();
      if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) return value ?? null;
      throw Error('Expected primitive public observation');
    });
    const fullJSON = operation => {
      const captured = read(operation);
      if (captured.status !== 'available') return captured;
      const serialized = read(() => JSON.stringify(captured.value));
      return serialized.status === 'available' ? { ...captured, json: serialized.value ?? null, jsonType: typeof serialized.value }
        : { status: 'serialization-error', error: serialized.error };
    };
    const vault = window.VildaVault, data = window.VildaDataImportExport, persistence = window.VildaPersistence;
    const account = read(() => {
      const user = vault.getCurrentUser();
      return { userId: typeof user?.userId === 'string' ? user.userId : null, label: typeof user?.label === 'string' ? user.label : null };
    });
    if (account.status !== 'available' || account.value.label !== 'Fikcyjny sejf testu panelu siatek') throw Error('Fictional diagnostic account unavailable');
    return {
      phase, atISO: new Date().toISOString(), atPerformance: performance.now(), location: location.href,
      account: account.value,
      // This reads the current function source; it never invokes or wraps the writer.
      writerFunctionSource: read(() => Function.prototype.toString.call(data.saveMainSessionNow)),
      entries: read(() => window.__vildaGhWriterObservationEntries || []),
      enabled: window.__vildaGhWriterObservationEnabled === true,
      mainSession: fullJSON(() => persistence.readMainSession()),
      publicReadOnlyUserSnapshot: { meaning: 'Public read-only snapshot; not the private native writer candidate.', ...fullJSON(() => data.captureCurrentUserDataReadOnly()) },
      moduleGH: read(() => persistence.readModuleJSON('GH_THERAPY_POINTS', [])),
      windowGH: read(() => window.ghTherapyPoints),
      patientId: primitive(() => sessionStorage.getItem('vildaCurrentPatientId')),
      documentPatientId: primitive(() => window._vildaCurrentPatientId),
      state: {
        readiness: read(() => data.getSaveReadiness()),
        paused: primitive(() => data.isMainSessionAutosavePaused()),
        suppressed: primitive(() => persistence.isAutosaveSuppressed()),
        restorePending: primitive(() => data.isMainSessionRestorePending()),
        applySequence: primitive(() => data.getApplyLoadedDataSequence()),
        initialMainSessionRestore: read(() => {
          const state = data.getInitialMainSessionRestoreState();
          return state == null ? null : { ready: state.ready === true, reason: typeof state.reason === 'string' ? state.reason : null };
        }),
        persistRestoring: primitive(() => window.__vildaPersistRestoring), mirrorWrite: primitive(() => window.__vildaLustroWpis),
      },
      dialog: { open: document.getElementById('vhomeGrowthDialog')?.open, tabsHidden: document.querySelector('#vhomeGrowthDialog .vhome-growth-tabs')?.hidden,
        panelPresent: !!document.getElementById('ghZWierszaPanel'), status: document.getElementById('vhomeGrowthDraftStatus')?.textContent,
        portalReturnSession: window.__ghSessionAtPortalReturn ?? null },
    };
  }, phase);
  const source = value.writerFunctionSource;
  const actualWriterSHA256 = source.status === 'available' && typeof source.value === 'string' ? sha(source.value) : null;
  // Persist the source hash, not a duplicate copy of the instrumented program.
  delete value.writerFunctionSource;
  const expectedWriterSHA256 = JSON.parse(fs.readFileSync(path.join(output, 'proof.json'), 'utf8')).writerFunctionSourceSHA256;
  const hits = routeHits.get(key(info)) || [];
  const verifiedRoute = hits.some(hit => hit.fulfilled === true && hit.nativeStatus === 200 && hit.nativeSHA256 === manifest.originalFiles['vilda_data_import_export.js'] && hit.observerSHA256 === manifest.observerSHA256);
  const verifiedCurrentWriter = actualWriterSHA256 === expectedWriterSHA256;
  const entries = value.entries.status === 'available' && Array.isArray(value.entries.value) ? value.entries.value : null;
  const captureValid = verifiedRoute && verifiedCurrentWriter && value.enabled && entries !== null;
  const evidenceStatus = captureValid ? entries.length ? 'REFUSAL_ENTRIES_OBSERVED_NOT_FIX_PROOF' : 'VERIFIED_REFUSAL_ONLY_CAPTURE_ZERO_ENTRIES'
    : phase === 'after-each' && !value.enabled ? 'POST_F5_RAM_RESET_OR_NOT_ENABLED_SEE_BEFORE_F5' : 'INCONCLUSIVE';
  const result = { kind: 'REFUSAL_ONLY_FICTIONAL_DIAGNOSTIC_NOT_RELEASE_GATE', ...identity(info), phase, status: info.status,
    evidenceStatus, verifiedRoute, verifiedCurrentWriter, actualWriterSHA256, expectedWriterSHA256,
    lateEnableObserved: value.enabled, entryCount: entries?.length ?? null, entryCapReached: entries !== null && entries.length >= 200,
    frameURL: frame.url(), routeHits: hits, value };
  observedPhases.get(key(info))?.push({ phase, evidenceStatus, captureValid, entryCount: result.entryCount });
  write(info, phase, result);
  await info.attach('refusal-only-native-gh-' + phase, { body: JSON.stringify(result), contentType: 'application/json' });
  if (phase === 'before-original-F5' && !captureValid) throw Error('Refusal-only diagnostic capture unavailable; see attached evidence');
}

export async function finish(page, info) {
  if (!isTarget(info)) return;
  try {
    for (const frame of page.frames()) {
      if (new URL(frame.url() || 'about:blank').pathname !== manifest.target.framePath) continue;
      try { await harvest(frame, 'after-each', info); }
      catch (error) { write(info, 'after-each-read-error', { ...identity(info), evidenceStatus: 'INCONCLUSIVE', error: String(error.message || error), frameURL: frame.url() }); }
    }
    const hits = routeHits.get(key(info)) || [];
    write(info, 'route-hits', { ...identity(info), evidenceStatus: hits.length ? 'EXACT_ROUTE_OBSERVED_REQUIRES_PHASE_ENABLE_AND_WRITER_HASH' : 'INCONCLUSIVE', hits, phases: observedPhases.get(key(info)) || [] });
  } finally { routeHits.delete(key(info)); observedPhases.delete(key(info)); }
}
