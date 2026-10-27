import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function setup({ lazy = false, frame = null } = {}) {
  const values = new Map();
  const source = { value: 'PALCZEWSKA' };
  const d = new EventTarget();
  d.querySelector = vi.fn(() => source);
  const w = new EventTarget();
  Object.assign(w, {
    document: d, location: { pathname: '/index.html' }, frameElement: frame,
    professionalMode: true, CustomEvent,
    sessionStorage: { getItem: (key) => values.get(key) || null },
    VildaDataImportExport: { getApplyLoadedDataSequence: () => 1 },
    VildaVault: { isUnlocked: () => true, onLock: vi.fn() },
  });
  w.parent = w;
  if (lazy) w.VildaPatientReportLoader = { ensure: vi.fn(() => Promise.resolve()) };
  loadBrowserScript('vilda_patient_documents.js', w);
  return { w, d, values, source, api: w.VildaPatientDocuments };
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
