import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function setup({ lazy = false, frame = null } = {}) {
  const values = new Map();
  const source = { value: 'PALCZEWSKA' };
  const vaultState = { userId: 'fictional-documents-owner', generation: 1, unlocked: true };
  const d = new EventTarget();
  d.querySelector = vi.fn(() => source);
  const w = new EventTarget();
  Object.assign(w, {
    document: d, location: { pathname: '/index.html' }, frameElement: frame,
    professionalMode: true, CustomEvent,
    sessionStorage: { getItem: (key) => values.get(key) || null },
    VildaDataImportExport: { getApplyLoadedDataSequence: () => 1 },
    VildaVault: { isUnlocked: () => vaultState.unlocked, onLock: vi.fn(),
      getCurrentUser: () => vaultState.unlocked ? { userId: vaultState.userId } : null,
      captureSyncOperationSession: () => Object.freeze({ userId: vaultState.userId, generation: vaultState.generation }),
      assertSyncOperationSession(token) {
        if (!vaultState.unlocked || token.userId !== vaultState.userId || token.generation !== vaultState.generation) throw new Error('Fictional stale documents session');
        return true;
      } },
  });
  w.parent = w;
  if (lazy) w.VildaPatientReportLoader = { ensure: vi.fn(() => Promise.resolve()) };
  loadBrowserScript('vilda_patient_documents.js', w);
  return { w, d, values, source, vaultState, api: w.VildaPatientDocuments };
}
const ready = { shouldShow: true, proMode: true, isDocPro: false };

describe('Dokumenty pacjenta — native readiness and operation ownership', () => {
  it('requires the native summary gate and keeps the existing PRO gate', () => {
    const { api, w } = setup();
    expect(api.getState().disabled).toBe(true);
    api.setSummaryState(ready);
    expect(api.getState().disabled).toBe(false);
    w.professionalMode = false;
    expect(api.getState().disabled).toBe(true);
    expect(api.getState().reason).toContain('PRO');
    w.location.pathname = '/docpro.html';
    api.setSummaryState({ ...ready, isDocPro: true, proMode: false });
    expect(api.getState().disabled).toBe(false);
    api.setSummaryState({ ...ready, shouldShow: false });
    expect(api.getState().disabled).toBe(true);
  });

  it('allows explicitly loading/retrying the report, but never opens from stale pre-load summary', async () => {
    const { api, w } = setup({ lazy: true });
    expect(api.getState().disabled).toBe(false);
    w.updateProfessionalSummaryCard = vi.fn(() => api.setSummaryState({ ...ready, shouldShow: false }));
    expect(await api.open()).toBe(false);
    expect(w.VildaPatientReportLoader.ensure).toHaveBeenCalledOnce();
    expect(w.updateProfessionalSummaryCard).toHaveBeenCalledOnce();
    expect(api.getState().disabled).toBe(true);
    expect(api.getState().busy).toBe(false);
  });

  it('allows retry after lazy loading fails and shares a pending open request', async () => {
    const { api, w } = setup({ lazy: true });
    w.VildaPatientReportLoader.ensure.mockRejectedValueOnce(new Error('offline'));
    const first = api.open();
    expect(api.open()).toBe(first);
    expect(await first).toBe(false);
    expect(api.getState().busy).toBe(false);
    expect(api.getState().disabled).toBe(false);
    w.updateProfessionalSummaryCard = vi.fn(() => api.setSummaryState({ ...ready, shouldShow: false }));
    expect(await api.open()).toBe(false);
    expect(w.VildaPatientReportLoader.ensure).toHaveBeenCalledTimes(2);
  });

  it.each(['patient', 'source', 'route', 'lock'])('cancels before reading native results after %s changes during lazy loading', async (change) => {
    const { api, w, values, source } = setup({ lazy: true });
    let finish;
    w.VildaPatientReportLoader.ensure.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    w.updateProfessionalSummaryCard = vi.fn();
    const options = { isCurrent: () => true };
    const request = api.open(options);
    await Promise.resolve();
    if (change === 'patient') values.set('vildaCurrentPatientId', 'synthetic-next-patient');
    if (change === 'source') source.value = 'OLAF';
    if (change === 'route') options.isCurrent = () => false;
    if (change === 'lock') w.VildaVault.isUnlocked = () => false, values.set('vildaCurrentPatientId', 'synthetic-locked-patient');
    finish();
    expect(await request).toBe(false);
    expect(w.updateProfessionalSummaryCard).not.toHaveBeenCalled();
    expect(api.getState().busy).toBe(false);
  });

  it('does not revive a pending open after a patient/source round trip', async () => {
    const { api, w, d, source } = setup({ lazy: true });
    let finish;
    w.VildaPatientReportLoader.ensure.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    w.updateProfessionalSummaryCard = vi.fn();
    const request = api.open();
    await Promise.resolve();
    source.value = 'OLAF';
    d.dispatchEvent(new Event('vilda:zrodlo-pacjenta-zmienione'));
    source.value = 'PALCZEWSKA';
    finish();
    expect(await request).toBe(false);
    expect(w.updateProfessionalSummaryCard).not.toHaveBeenCalled();
  });

  it('captures native readiness in a preloaded frame without enabling its inactive action', () => {
    const frame = { hidden: true, isConnected: true, getAttribute: () => null };
    const { api } = setup({ frame });
    api.setSummaryState(ready);
    expect(api.getState().disabled).toBe(true);
    frame.hidden = false;
    expect(api.getState().disabled).toBe(false);
  });

  it('rejects cached ownership once the session points to another patient', () => {
    const { api, values } = setup();
    values.set('vildaCurrentPatientId', 'synthetic-patient-a');
    api.setSummaryState(ready);
    expect(api.getState().disabled).toBe(false);
    values.set('vildaCurrentPatientId', 'synthetic-patient-b');
    expect(api.getState().disabled).toBe(true);
  });

  it('announces authoritative gates and busy transitions to the persistent menu', async () => {
    const { api, w, d } = setup({ lazy: true });
    const states = [];
    d.addEventListener('vilda:patient-documents-state', (event) => states.push(event.detail));
    w.updateProfessionalSummaryCard = () => api.setSummaryState({ ...ready, shouldShow: false });
    await api.open();
    expect(states.some((state) => state.busy)).toBe(true);
    expect(states.at(-1)).toMatchObject({ disabled: true, busy: false });
  });
});

// Exercise the production package orchestrator with the PDF rendering/delivery
// boundaries replaced; no report content or clinical functions are duplicated.
async function reportRuntime() {
  const { default: vm } = await import('node:vm');
  const { readFileSync } = await import('node:fs');
  const context = {
    document: { addEventListener() {}, getElementById: () => null, querySelector: () => null,
      documentElement: { classList: { add() {}, remove() {} } } }, console, Blob,
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL('../../vilda_patient_report.js', import.meta.url), 'utf8'), context);
  context.patientReportGetPdfChoiceOptions = () => [{ value: 'visit', title: 'Visit' }, { value: 'diet', title: 'Diet' }];
  context.patientReportResolveFilenameBase = () => 'synthetic';
  context.vildaEnsureGlobalDependencyContract = () => true;
  context.vildaRequireGlobalFunction = () => class {
    setProperties() {} addPage() {} addImage() {}
    output() { return new Blob(['synthetic-pdf']); }
  };
  context.patientReportShowToast = vi.fn();
  context.patientReportDeliverFiles = vi.fn(() => Promise.resolve('download'));
  return context;
}

describe('Native PDF package — cancelled patient ownership', () => {
  it('stops between collectors when a patient changes while the first PDF awaits rendering', async () => {
    const runtime = await reportRuntime();
    let samePatient = true;
    runtime.patientReportCollectVisitPdfPages = vi.fn(async () => {
      samePatient = false;
      return { pages: [{ dataUrl: 'synthetic', orientation: 'portrait' }], filenameBase: 'synthetic' };
    });
    runtime.dietRecommendationsCollectPdfPages = vi.fn();
    await expect(runtime.patientReportBuildSelectedPdfPackage(['visit', 'diet'], {
      isCurrent: () => samePatient,
    })).rejects.toMatchObject({ code: 'USER_CANCELLED' });
    expect(runtime.patientReportCollectVisitPdfPages).toHaveBeenCalledOnce();
    expect(runtime.dietRecommendationsCollectPdfPages).not.toHaveBeenCalled();
    expect(runtime.patientReportDeliverFiles).not.toHaveBeenCalled();
  });

  it('checks ownership again immediately before delivering a completed native package', async () => {
    const runtime = await reportRuntime();
    let samePatient = true;
    runtime.patientReportBuildSelectedPdfPackage = vi.fn(async () => {
      samePatient = false;
      return { blob: new Blob(['synthetic-pdf']), filename: 'synthetic.pdf' };
    });
    await runtime.generatePatientSelectedPdfPackage(null, ['visit'], { isCurrent: () => samePatient });
    expect(runtime.patientReportBuildSelectedPdfPackage).toHaveBeenCalledOnce();
    expect(runtime.patientReportDeliverFiles).not.toHaveBeenCalled();
    expect(runtime.patientReportShowToast).not.toHaveBeenCalled();
  });

  it('keeps the original generator callable without the new optional ownership guard', async () => {
    const runtime = await reportRuntime();
    runtime.patientReportBuildSelectedPdfPackage = vi.fn(async () => ({ blob: new Blob(['synthetic-pdf']), filename: 'synthetic.pdf' }));
    runtime.patientReportToastPoZapisie = () => 'PDF ready';
    await runtime.generatePatientSelectedPdfPackage(null, ['visit']);
    expect(runtime.patientReportDeliverFiles).toHaveBeenCalledOnce();
    expect(runtime.patientReportDeliverFiles.mock.calls[0][0][0].filename).toBe('synthetic.pdf');
  });
});

// Minimal DOM boundary for executing the entire production dialog. It does not
// calculate narrative/PDF content; existing E2E covers those native modules.
function dialogEnvironment({ lazy = false } = {}) {
  const h = setup({ lazy });
  class Node extends EventTarget {
    constructor(tag) {
      super(); this.tagName = tag.toUpperCase(); this.children = []; this.attributes = new Map(); this.open = false;
      const names = new Set(); this.classList = { contains: name => names.has(name), add: name => names.add(name),
        toggle(name, on) { if (on) names.add(name); else names.delete(name); } };
    }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    appendChild(node) { this.children.push(node); node.parentNode = this; return node; }
    append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(node => node !== this); this.parentNode = null; }
    querySelectorAll(selector) {
      const rows = [], visit = node => { for (const child of node.children) { rows.push(child); visit(child); } }; visit(this);
      return rows.filter(node => selector.split(',').some(value => {
        const attribute = value.match(/^\[([^\]]+)\]$/)?.[1];
        if (attribute) return node.attributes.has(attribute);
        const tag = value.match(/^([a-z]+)/)?.[1];
        return (!tag || node.tagName === tag.toUpperCase()) && (!value.includes(':checked') || node.checked)
          && (!value.includes(':not(:disabled)') || !node.disabled);
      }));
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    focus() { h.d.activeElement = this; }
    showModal() { this.open = true; }
    close() { this.open = false; this.dispatchEvent(new Event('close')); }
  }
  h.d.documentElement = new Node('html'); h.d.body = h.d.documentElement.appendChild(new Node('body'));
  h.d.defaultView = h.w; h.d.createElement = tag => new Node(tag);
  h.d.getElementById = id => h.d.documentElement.querySelectorAll('*').find(node => node.id === id) || null;
  h.w.lastLoadedData = { name: 'Fikcyjny Pacjent Dokumentów', birth: { weeks: '39' } };
  h.w.VildaPatientNarrativeUI = { describeCurrent: () => ({ text: 'Fikcyjny opis do dokumentacji.' }),
    copyCurrent: vi.fn(async () => ({ ok: true })) };
  h.w.updateProfessionalSummaryCard = vi.fn(() => h.api.setSummaryState(ready));
  h.api.setSummaryState(ready);
  return { ...h, dialog: () => h.d.getElementById('patientDocumentsDialog'),
    imported: detail => h.d.dispatchEvent(new CustomEvent('vilda:json-imported', { detail })) };
}

describe('Documents retain their exact owner across deferred import completion', () => {
  it('retains the shown dialog, focus and enabled Copy after its own finalized import notification', async () => {
    const h = dialogEnvironment(); expect(await h.api.open()).toBe(true);
    const dialog = h.dialog(), focus = h.d.activeElement;
    h.imported({ applySequence: 1, source: 'json-import' });
    expect(h.dialog()).toBe(dialog); expect(dialog.open).toBe(true); expect(h.d.activeElement).toBe(focus);
    expect(dialog.querySelector('[data-patient-documents-copy]').disabled).toBe(false);
    dialog.querySelector('[data-patient-documents-copy]').dispatchEvent(new Event('click'));
    await vi.waitFor(() => expect(h.w.VildaPatientNarrativeUI.copyCurrent).toHaveBeenCalledOnce());
  });

  it('does not cancel the same pending owner when the import notification arrives during cold report loading', async () => {
    const h = dialogEnvironment({ lazy: true }); let finish;
    h.w.VildaPatientReportLoader.ensure.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const opening = h.api.open(); await Promise.resolve();
    h.imported({ applySequence: 1, source: 'json-import' }); finish();
    expect(await opening).toBe(true); expect(h.dialog()?.open).toBe(true);
  });

  for (const phase of ['active', 'pending']) it.each(['account', 'new-session', 'replaced-vault', 'guest-mode'])(`does not retain ${phase} documents after %s changes without onLock`, async change => {
    const h = dialogEnvironment({ lazy: phase === 'pending' }); let finish;
    if (phase === 'pending') h.w.VildaPatientReportLoader.ensure.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const opening = h.api.open(); await Promise.resolve();
    if (phase === 'active') expect(await opening).toBe(true);
    if (change === 'account') h.vaultState.userId = 'fictional-other-documents-account';
    if (change === 'new-session') h.vaultState.generation++;
    if (change === 'replaced-vault') h.w.VildaVault = { ...h.w.VildaVault };
    if (change === 'guest-mode') h.w.VildaGuestMode = true;
    h.imported({ applySequence: 1, source: 'json-import' });
    if (phase === 'pending') { finish(); expect(await opening).toBe(false); }
    expect(h.dialog()).toBeNull();
  });

  it.each(['locked', 'guest-without-vault'])('preserves the same %s no-account document mode', async mode => {
    const h = dialogEnvironment(); h.vaultState.unlocked = false;
    if (mode === 'guest-without-vault') { h.w.VildaGuestMode = true; delete h.w.VildaVault; }
    expect(await h.api.open()).toBe(true); const dialog = h.dialog();
    h.imported({ applySequence: 1, source: 'json-import' });
    expect(h.dialog()).toBe(dialog); expect(dialog.open).toBe(true);
  });

  it.each(['missing-ticket', 'capture-failed', 'assert-failed'])('falls back to invalidation when import account proof is %s', async reason => {
    const h = dialogEnvironment();
    if (reason === 'missing-ticket') delete h.w.VildaVault.captureSyncOperationSession;
    if (reason === 'capture-failed') h.w.VildaVault.captureSyncOperationSession = () => { throw new Error('Fictional missing account proof'); };
    if (reason === 'assert-failed') h.w.VildaVault.assertSyncOperationSession = () => { throw new Error('Fictional failed account proof'); };
    expect(await h.api.open()).toBe(true);
    h.imported({ applySequence: 1, source: 'json-import' });
    expect(h.dialog()).toBeNull();
  });

  it.each(['missing-sequence', 'string-sequence', 'zero-sequence', 'fraction-sequence', 'wrong-sequence', 'new-load', 'loaded-identity', 'patient', 'source', 'route', 'lock', 'clear', 'input', 'restore-pending'])('still invalidates an active dialog for %s', async change => {
    const h = dialogEnvironment(); expect(await h.api.open()).toBe(true);
    let detail = { applySequence: 1, source: 'json-import' };
    if (change === 'missing-sequence') detail = { source: 'json-import' };
    if (change === 'string-sequence') detail.applySequence = '1';
    if (change === 'zero-sequence') detail.applySequence = 0;
    if (change === 'fraction-sequence') detail.applySequence = 1.5;
    if (change === 'wrong-sequence') detail.applySequence = 2;
    if (change === 'new-load') { h.w.VildaDataImportExport.getApplyLoadedDataSequence = () => 2; detail.applySequence = 2; }
    if (change === 'loaded-identity') h.w.lastLoadedData = structuredClone(h.w.lastLoadedData);
    if (change === 'patient') h.values.set('vildaCurrentPatientId', 'fictional-other-documents-patient');
    if (change === 'source') h.source.value = 'OLAF';
    if (change === 'route') h.w.location.pathname = '/docpro.html';
    if (change === 'restore-pending') h.w.VildaDobAge = { restorePending: () => true };
    if (change === 'lock') h.w.VildaVault.onLock.mock.calls[0][0]();
    else if (change === 'clear') h.d.dispatchEvent(new Event('vilda:user-state-cleared'));
    else if (change === 'input') {
      const event = new Event('input'); Object.defineProperty(event, 'target', { value: { closest: () => ({}) } }); h.d.dispatchEvent(event);
    } else h.imported(detail);
    expect(h.dialog()).toBeNull();
  });
});
