import { readFileSync } from 'node:fs';
import { parse } from 'espree';
import { describe, expect, it, vi } from 'vitest';

// Execute the production actors, including their real async/finally boundaries.
// Only browser layout, canvas, PDF encoding and delivery are controlled here.
const extractionCache = new Map();
function namedFunctions(file, names) {
  const cacheKey = file + ':' + names.join(',');
  if (extractionCache.has(cacheKey)) return extractionCache.get(cacheKey);
  const source = readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'script', range: true });
  const found = new Map();
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'FunctionDeclaration' && names.includes(node.id?.name)) {
      if (found.has(node.id.name)) throw new Error('Ambiguous production function: ' + node.id.name);
      found.set(node.id.name, source.slice(...node.range));
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(ast);
  const functions = names.map(name => {
    if (!found.has(name)) throw new Error('Missing production function: ' + name);
    return found.get(name);
  }).join('\n');
  extractionCache.set(cacheKey, functions);
  return functions;
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness({ dependencyWait, canvasWait, downloadWait, layoutWaitAt, externalTask = true, age = 35 } = {}) {
  const dependencyStarted = deferred(), canvasStarted = deferred(), downloadStarted = deferred(), layoutStarted = deferred();
  const hosts = [], pdfs = [], deliveries = [];
  let layoutCalls = 0;
  const page = {
    offsetWidth: 1240, offsetHeight: 1754,
    classList: { contains: name => name === 'diet-pdf-page-classic-single' },
  };
  const model = vi.fn(() => ({ mode: 'classic', filenameBase: 'pacjent_fikcyjny', title: 'Zalecenia pacjenta fikcyjnego' }));
  const createHost = vi.fn(() => {
    const host = {
      querySelectorAll: vi.fn(() => [page]), querySelector: vi.fn(() => null), remove: vi.fn(),
    };
    hosts.push(host);
    return host;
  });
  const canvas = vi.fn(async () => {
    canvasStarted.resolve();
    return canvasWait ? canvasWait.promise : { syntheticCanvas: true };
  });
  const pageSpec = vi.fn(() => ({
    dataUrl: 'data:image/jpeg;base64,ZmljdGlvbmFs', orientation: 'portrait', format: 'JPEG', widthMm: 210, heightMm: 297,
  }));
  const blobOutput = vi.fn();
  function Pdf(settings) {
    const trace = { settings, properties: null, pages: [], images: [] };
    pdfs.push(trace);
    this.setProperties = properties => { trace.properties = properties; };
    this.addPage = (...args) => { trace.pages.push(args); };
    this.addImage = (...args) => { trace.images.push(args); };
    this.output = type => {
      blobOutput(type);
      return new Blob([JSON.stringify(trace)], { type: 'application/pdf' });
    };
  }
  const download = vi.fn(async (blob, filename) => {
    deliveries.push({ blob, filename });
    downloadStarted.resolve();
    return downloadWait ? downloadWait.promise : { droga: 'download' };
  });
  const toast = vi.fn(), error = vi.fn(), warning = vi.fn();
  const globals = {
    window: {
      vildaEnsurePdfLibraries: vi.fn(async () => {
        dependencyStarted.resolve();
        if (dependencyWait) await dependencyWait.promise;
      }),
      VildaRaportPlan: { dopasuj: vi.fn() },
    },
    document: {
      getElementById: id => ({ weight: { value: '80' }, height: { value: '175' } })[id] || null,
      body: { appendChild: vi.fn() }, documentElement: { clientWidth: 1440, clientHeight: 1000 },
    },
    Blob,
    console: { error },
    ee: vi.fn(() => age), xt: model, Dt: vi.fn(() => '<div class="diet-pdf-page"></div>'), It: vi.fn(),
    vildaEnsureGlobalDependencyContract: vi.fn(),
    vildaRequireGlobalFunction: vi.fn(name => name === 'jspdf.jsPDF' ? Pdf : name === 'html2canvas' ? canvas : null),
    patientReportCreateRenderHost: createHost,
    patientReportResolveRenderScale: vi.fn(() => 2),
    patientReportBuildPdfPageSpecFromCanvas: pageSpec,
    patientReportSliceCanvasToPageSpecs: vi.fn(() => [pageSpec()]),
    vildaAppSetTrustedHtml: vi.fn(), vildaAppRestoreClonedChildren: vi.fn(),
    vildaLogAppWarn: warning,
    patientReportDownloadBlob: download,
    patientReportShowToast: toast,
    patientReportToastPoZapisie: vi.fn((_route, message) => message),
    vildaShowDependencyFallbackNotice: vi.fn(),
  };
  const layoutRelease = deferred();
  // A separate release promise prevents a test from depending on microtask counts.
  globals.patientReportWaitForStableLayout = vi.fn(async () => {
    layoutCalls++;
    if (layoutCalls === layoutWaitAt) { layoutStarted.resolve(); await layoutRelease.promise; }
  });
  const actors = namedFunctions('vilda_diet_recommendations.js', ['ve', 'dietPdfGuard', 'di', 'ri', 'Le']);
  const runner = externalTask
    ? namedFunctions('vilda_patient_report.js', ['patientReportRunExternalPdfTask'])
    : 'var patientReportRunExternalPdfTask;';
  const api = new Function(...Object.keys(globals),
    '"use strict";\nlet __patientReportPdfInFlight = false;\n' + runner + '\n' + actors + '\nreturn { di, ri, Le };')(...Object.values(globals));
  return {
    api, globals, model, hosts, pdfs, deliveries, pageSpec, blobOutput, canvas, download, toast, error, warning,
    dependencyStarted: dependencyStarted.promise, canvasStarted: canvasStarted.promise,
    downloadStarted: downloadStarted.promise, layoutStarted: layoutStarted.promise, layoutRelease,
  };
}

describe('Native dietary PDF ownership across asynchronous actors', () => {
  it('rejects a stale request before validation, dependency loading or reading a patient model', async () => {
    const h = harness({ age: 0 });
    await h.api.Le('classic', { isCurrent: () => false });
    expect(h.globals.ee).not.toHaveBeenCalled();
    expect(h.globals.window.vildaEnsurePdfLibraries).not.toHaveBeenCalled();
    expect(h.model).not.toHaveBeenCalled();
    expect(h.download).not.toHaveBeenCalled();
    expect(h.toast).not.toHaveBeenCalled();
    expect(h.error).not.toHaveBeenCalled();
  });

  it('captures the guard callback once and stops an old owner after delayed dependency loading', async () => {
    const deps = deferred(), h = harness({ dependencyWait: deps });
    let current = true, callback = () => current;
    const getter = vi.fn(() => callback), options = {};
    Object.defineProperty(options, 'isCurrent', { get: getter });
    const job = h.api.Le('classic', options);
    await h.dependencyStarted;
    current = false;
    callback = () => true;
    deps.resolve();
    await job;
    expect(getter).toHaveBeenCalledTimes(1);
    expect(h.model).not.toHaveBeenCalled();
    expect(h.hosts).toHaveLength(0);
    expect(h.blobOutput).not.toHaveBeenCalled();
    expect(h.download).not.toHaveBeenCalled();
    expect(h.toast).not.toHaveBeenCalled();
    expect(h.error).not.toHaveBeenCalled();
  });

  it.each([1, 2, 3])('cleans the render host when ownership changes during layout wait %i', async layoutWaitAt => {
    const h = harness({ layoutWaitAt });
    let current = true;
    const job = h.api.Le('classic', { isCurrent: () => current });
    await h.layoutStarted;
    current = false;
    h.layoutRelease.resolve();
    await job;
    expect(h.model).toHaveBeenCalledTimes(1);
    expect(h.hosts).toHaveLength(1);
    expect(h.hosts[0].remove).toHaveBeenCalledTimes(1);
    expect(h.canvas).not.toHaveBeenCalled();
    expect(h.download).not.toHaveBeenCalled();
    expect(h.toast).not.toHaveBeenCalled();
    expect(h.error).not.toHaveBeenCalled();
  });

  it('drops a completed canvas for a stale owner before constructing a PDF package or delivering it', async () => {
    const canvasWait = deferred(), h = harness({ canvasWait });
    let current = true;
    const job = h.api.Le('classic', { isCurrent: () => current });
    await h.canvasStarted;
    current = false;
    canvasWait.resolve({ syntheticCanvas: true });
    await job;
    expect(h.hosts[0].remove).toHaveBeenCalledTimes(1);
    expect(h.pageSpec).not.toHaveBeenCalled();
    expect(h.pdfs).toHaveLength(0);
    expect(h.blobOutput).not.toHaveBeenCalled();
    expect(h.download).not.toHaveBeenCalled();
    expect(h.toast).not.toHaveBeenCalled();
    expect(h.error).not.toHaveBeenCalled();
  });

  it('does not announce success for a different owner after a pending download finishes', async () => {
    const downloadWait = deferred(), h = harness({ downloadWait });
    let current = true;
    const job = h.api.Le('classic', { isCurrent: () => current });
    await h.downloadStarted;
    current = false;
    downloadWait.resolve({ droga: 'download' });
    await job;
    expect(h.download).toHaveBeenCalledTimes(1);
    expect(h.hosts[0].remove).toHaveBeenCalledTimes(1);
    expect(h.toast).not.toHaveBeenCalled();
    expect(h.error).not.toHaveBeenCalled();
  });

  it('keeps the unguarded native package byte-equivalent to an always-current guarded package', async () => {
    const legacy = harness(), guarded = harness();
    const original = await legacy.api.ri('classic');
    const current = await guarded.api.ri('classic', { isCurrent: () => true });
    expect(current.filename).toBe(original.filename);
    expect(current.fitWarning).toBe(original.fitWarning);
    expect(current.blob.type).toBe(original.blob.type);
    expect(new Uint8Array(await current.blob.arrayBuffer())).toEqual(new Uint8Array(await original.blob.arrayBuffer()));
    expect(guarded.pdfs).toEqual(legacy.pdfs);
    expect(guarded.hosts[0].remove).toHaveBeenCalledTimes(1);
    expect(legacy.hosts[0].remove).toHaveBeenCalledTimes(1);
  });

  it.each([true, false])('preserves legacy button/mode calls and new guarded calls (external task: %s)', async externalTask => {
    const h = harness({ externalTask });
    const button = { disabled: false, childNodes: [], textContent: 'Raport PDF dla pacjenta' };
    await h.api.Le(button, 'classic');
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe('Raport PDF dla pacjenta');
    await h.api.Le('classic', { isCurrent: () => true });
    expect(h.download).toHaveBeenCalledTimes(2);
    expect(h.toast).toHaveBeenCalledTimes(2);
    expect(h.error).not.toHaveBeenCalled();
    expect(h.deliveries.map(item => item.filename)).toEqual([
      'Raport_zalecen_dietetycznych_pacjent_fikcyjny.pdf', 'Raport_zalecen_dietetycznych_pacjent_fikcyjny.pdf',
    ]);
  });

  it('honors the optional guard on a legacy button/mode call and restores its busy state', async () => {
    const dependencyWait = deferred(), h = harness({ dependencyWait });
    const button = { disabled: false, childNodes: [], textContent: 'Raport PDF dla pacjenta' };
    let current = true;
    const job = h.api.Le(button, 'classic', { isCurrent: () => current });
    await h.dependencyStarted;
    expect(button.disabled).toBe(true);
    current = false;
    dependencyWait.resolve();
    await job;
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe('Raport PDF dla pacjenta');
    expect(h.model).not.toHaveBeenCalled();
    expect(h.download).not.toHaveBeenCalled();
    expect(h.toast).not.toHaveBeenCalled();
    expect(h.error).not.toHaveBeenCalled();
  });

  it('quietly cleans up a rendering failure that returns after its owner has changed', async () => {
    const canvasWait = deferred(), h = harness({ canvasWait });
    let current = true;
    const job = h.api.Le('classic', { isCurrent: () => current });
    await h.canvasStarted;
    current = false;
    canvasWait.reject(new Error('Fikcyjny stary render został odrzucony'));
    await job;
    expect(h.hosts[0].remove).toHaveBeenCalledTimes(1);
    expect(h.download).not.toHaveBeenCalled();
    expect(h.toast).not.toHaveBeenCalled();
    expect(h.error).not.toHaveBeenCalled();
  });

  it('retains genuine generation errors and host cleanup while the owner remains current', async () => {
    const h = harness(), failure = new Error('Nie udało się wyrenderować fikcyjnej strony');
    h.canvas.mockRejectedValueOnce(failure);
    await h.api.Le('classic', { isCurrent: () => true });
    expect(h.hosts[0].remove).toHaveBeenCalledTimes(1);
    expect(h.download).not.toHaveBeenCalled();
    expect(h.error).toHaveBeenCalledWith(expect.stringContaining('Błąd generowania'), failure);
    expect(h.toast).toHaveBeenCalledWith(failure.message);
  });
});
