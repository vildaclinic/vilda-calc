import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));

function events() {
  const handlers = new Map();
  return {
    addEventListener(type, handler) {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type).push(handler);
    },
    dispatchEvent(event) {
      (handlers.get(event.type) || []).slice().forEach(handler => handler(event));
      return true;
    }
  };
}

// The DOM, vault and same-tab transport are controlled here. All assessment,
// editing, owner qualification and source selection use the production modules.
function tab({ patientId = 'synthetic-a', unlocked = true } = {}) {
  let id = patientId;
  let open = unlocked;
  let saved = null;
  let clearing = false;
  const locks = [];
  const vault = { isUnlocked: () => open, onLock: listener => locks.push(listener) };
  const storage = { getItem: key => key === 'vildaCurrentPatientId' ? id : null };
  const persistence = { readMainSession: () => copy(saved), isClearInProgress: () => clearing };
  const shell = { document: { ...events(), getElementById: () => null }, frames: [], VildaShell: { protokolPanelu: 1 } };
  function page({ main = false, sex = 'M', years = '12', months = '0', realPanel = false } = {}) {
    const fields = new Map(Object.entries({ sex, age: years, ageMonths: months,
      pubertyGnrhaStatus: '', pubertyOnsetAge: '', pubertyMenarcheAge: '',
      pubertyMenarcheHeight: '', pubertyMenarcheBoneAge: '', pubertyCdgp: '' })
      .map(([key, value]) => [key, { id: key, value }]));
    if (main) fields.set('tannerStageWrap', { id: 'tannerStageWrap' });
    let stale = false;
    const win = { document: { ...events(), getElementById: key => fields.get(key) || null },
      frames: [], parent: shell, top: shell, sessionStorage: storage, VildaVault: vault,
      VildaPersistence: persistence, VildaPanelPacjent: { nieaktualny: () => stale },
      VildaDobAge: { readMeasuredAtISO: () => null }, setTimeout: () => 0, clearTimeout() {},
      CustomEvent: class CustomEvent { constructor(type, options) { this.type = type; this.detail = options.detail; } },
      ...events() };
    shell.frames.push(win);
    if (realPanel) {
      delete win.VildaPanelPacjent;
      win.VildaDataImportExport = { anyDataEntered: () => Number(fields.get('age').value) > 0 };
      loadBrowserScript('vilda_panel_pacjent.js', win);
    }
    loadBrowserScript('vilda_puberty_assessment.js', win);
    if (main) loadBrowserScript('vilda_puberty_assessment_state.js', win);
    loadBrowserScript('vilda_puberty_assessment_context.js', win);
    const state = win.VildaPubertyAssessmentState;
    const runtime = win.VildaPubertyAssessmentContext;
    return { win, fields, state, runtime,
      stale: () => { stale = true; },
      edit: (axis, stage) => state.editObservation(axis, stage),
      save() {
        const user = { sex: fields.get('sex').value, age: Number(fields.get('age').value),
          ageMonths: Number(fields.get('ageMonths').value), measuredAtISO: null };
        state.applyToUser(user);
        saved = { version: 1, user, puberty: { gnrhaStatus: fields.get('pubertyGnrhaStatus').value || null } };
        return copy(saved);
      },
      restore: payload => state.load(copy(payload), { restore: true }),
      setSex(value) {
        fields.get('sex').value = value;
        win.document.dispatchEvent({ type: 'input', isTrusted: true, target: fields.get('sex') });
      } };
  }
  return { page, setPatient: value => { id = value; },
    lock: () => { open = false; locks.slice().forEach(listener => listener()); },
    replaceAccountContext() {
      const next = { isUnlocked: () => true, onLock() {} };
      shell.frames.forEach(win => { win.VildaVault = next; });
    },
    replaceSession: value => { saved = copy(value); }, clearInProgress: (value = true) => { clearing = value; } };
}

describe('shared puberty context — active forms and same-tab session', () => {
  it('reads the live sibling examination before the ordinary session autosave', () => {
    const t = tab(); const main = t.page({ main: true });
    expect(main.edit('G', 4)).toEqual({ ok: true }); main.save();
    expect(main.edit('G', 2)).toEqual({ ok: true });
    const lab = t.page();
    expect(lab.runtime.readActiveContext()).toMatchObject({ available: true, scope: 'visit', canEditVisit: true,
      gonadal: { kind: 'G', stage: 2, current: true } });
  });

  it('does not let an older sibling replace the currently edited examination', () => {
    const t = tab(); const start = t.page({ main: true });
    start.edit('G', 4); const previous = start.save();
    const docpro = t.page({ main: true }); docpro.restore(previous);
    start.edit('G', 2);
    const lab = t.page();
    expect(lab.runtime.readActiveContext().gonadal).toMatchObject({ kind: 'G', stage: 2, current: true });
  });

  it('edits one shared observation and notifies a subscribed consumer', () => {
    const t = tab(); const main = t.page({ main: true }); main.edit('G', 3);
    const lab = t.page(); const changed = vi.fn(); const stop = lab.runtime.subscribe(changed);
    const gonadalBefore = copy(main.state.read().assessment.observations.G);
    expect(lab.runtime.editObservation('P', 2)).toEqual({ ok: true });
    expect(main.state.read().assessment.observations.G).toEqual(gonadalBefore);
    expect(lab.runtime.readActiveContext().axisStates.P).toMatchObject({ stage: 2, current: true });
    expect(changed).toHaveBeenCalled();
    stop(); changed.mockClear(); main.edit('P', 3); expect(changed).not.toHaveBeenCalled();
  });

  it('transports the same visit into a standalone read-only context', () => {
    const t = tab(); const main = t.page({ main: true }); main.edit('G', 2); const saved = main.save();
    const separate = tab(); separate.replaceSession(saved); const lab = separate.page();
    expect(lab.runtime.readActiveContext()).toMatchObject({ available: true, scope: 'local', canEditVisit: false,
      gonadal: { stage: 2, current: true } });
    expect(lab.runtime.editObservation('G', 4)).toEqual({ ok: false, reason: 'no-active-visit' });
  });

  it('keeps the age-qualified growth context separate from the current examination', () => {
    const t = tab(); const main = t.page({ main: true });
    main.restore({ user: { sex: 'M', age: 12, ageMonths: 0, pubertyAssessment: { version: 1, sex: 'M',
      observations: { G: { stage: 3, ageMonths: 138, observedAtISO: null }, Th: null, P: null } } } });
    const context = t.page().runtime.readActiveContext();
    expect(context.gonadal).toMatchObject({ stage: null, current: false });
    expect(context.growth).toMatchObject({ stage: 3, status: 'historical', usableForGrowth: true });
  });

  it('preserves independently entered age parts and reads the live demographics', () => {
    const t = tab({ patientId: null }); const main = t.page({ main: true, sex: 'F', years: '', months: '3' });
    main.edit('Th', 1);
    expect(t.page().runtime.readActiveContext().demographics).toEqual({ sex: 'F', ageYears: null,
      ageMonths: 3, birthDateISO: null });
    main.fields.get('age').value = '11';
    main.win.document.dispatchEvent({ type: 'input', isTrusted: true, target: main.fields.get('age') });
    expect(t.page().runtime.readActiveContext().demographics).toMatchObject({ ageYears: 11, ageMonths: 3 });
  });

  it('distinguishes form preparation from an ordinary autosave pause', () => {
    const t = tab(); const main = t.page({ main: true }); main.edit('G', 2); const lab = t.page();
    main.win.__vildaPersistPauseUntil = Date.now() + 60_000;
    expect(lab.runtime.readActiveContext().preparing).toBe(false);
    main.win.__vildaPersistRestoring = true;
    expect(lab.runtime.readActiveContext().preparing).toBe(true);
    main.win.__vildaPersistRestoring = false;
    expect(lab.runtime.readActiveContext().preparing).toBe(false);
  });

  it('does not replace an explicitly empty active assessment with an older session', () => {
    const t = tab(); const main = t.page({ main: true }); main.edit('G', 4); main.save();
    main.edit('G', null);
    const context = t.page().runtime.readActiveContext();
    expect(context.assessmentContext.assessment.observations.G).toBeNull();
    expect(context.gonadal.stage).toBeNull();
  });

  it('keeps untyped legacy and pubic hair independent from the gonadal observation', () => {
    const t = tab(); const main = t.page({ main: true });
    main.restore({ user: { sex: 'M', tannerStage: 4 } }); const lab = t.page();
    expect(lab.runtime.readActiveContext().assessmentContext.legacy).toEqual({ kind: 'unspecified', stage: 4 });
    expect(lab.runtime.readActiveContext().gonadal.stage).toBeNull();
    main.edit('P', 5);
    expect(lab.runtime.readActiveContext().axisStates.P).toMatchObject({ stage: 5, current: true });
    expect(lab.runtime.gonadalForGrowth().stage).toBeNull();
  });

  it('makes known therapy available from the active form and its serialized visit', () => {
    const t = tab(); const main = t.page({ main: true });
    main.fields.get('pubertyGnrhaStatus').value = 'w-trakcie'; main.edit('G', 2);
    expect(t.page().runtime.readActiveContext().puberty.gnrhaStatus).toBe('w-trakcie');
    const saved = main.save(); const separate = tab(); separate.replaceSession(saved);
    expect(separate.page().runtime.readActiveContext().puberty.gnrhaStatus).toBe('w-trakcie');
  });

  it('uses a newly entered therapy fact without requiring another stage selection', () => {
    const t = tab(); const start = t.page({ main: true }); start.edit('G', 2);
    const previous = start.save(); const docpro = t.page({ main: true }); docpro.restore(previous);
    const field = start.fields.get('pubertyGnrhaStatus'); field.value = 'w-trakcie';
    start.win.document.dispatchEvent({ type: 'change', isTrusted: true, target: field });
    expect(t.page().runtime.readActiveContext().puberty.gnrhaStatus).toBe('w-trakcie');
  });
});

describe('shared puberty context — patient, sex and account boundaries', () => {
  it('keeps an anonymous visit usable when an unrelated account is locked', () => {
    const t = tab({ patientId: null, unlocked: false }); const main = t.page({ main: true, sex: 'F' });
    expect(main.edit('Th', 2)).toEqual({ ok: true }); const saved = main.save();
    expect(t.page().runtime.readActiveContext().gonadal).toMatchObject({ kind: 'Th', stage: 2, current: true });
    const separate = tab({ patientId: null, unlocked: false }); separate.replaceSession(saved);
    expect(separate.page().runtime.readActiveContext().gonadal.stage).toBe(2);
  });

  it('invalidates a patient-scoped assessment on account lock and notifies consumers', () => {
    const t = tab(); const main = t.page({ main: true }); main.edit('G', 3); main.save();
    const lab = t.page(); const changed = vi.fn(); lab.runtime.subscribe(changed);
    t.lock();
    expect(changed).toHaveBeenCalled();
    expect(lab.runtime.readActiveContext()).toMatchObject({ available: false, gonadal: { stage: null } });
  });

  it('uses a saved session only for its recorded patient', () => {
    const t = tab(); const main = t.page({ main: true }); main.edit('G', 3); const saved = main.save();
    const separate = tab({ patientId: 'synthetic-b' }); separate.replaceSession(saved);
    expect(separate.page().runtime.readActiveContext().available).toBe(false);
    t.setPatient('synthetic-b');
    expect(t.page().runtime.readActiveContext().gonadal.stage).toBeNull();
  });

  it('requires a valid examination owner after the active account context changes', () => {
    const t = tab(); const main = t.page({ main: true }); main.edit('G', 3); main.save();
    const lab = t.page(); t.replaceAccountContext();
    expect(lab.runtime.readActiveContext().gonadal.stage).toBeNull();
  });

  it('refuses a stale calling panel, an unexpected patient and a clear in progress', () => {
    const t = tab(); const main = t.page({ main: true }); main.edit('G', 3); main.save(); const lab = t.page();
    expect(lab.runtime.readActiveContext({ patientId: 'synthetic-b' }).available).toBe(false);
    lab.stale(); expect(lab.runtime.readActiveContext().available).toBe(false);
    const current = t.page(); t.clearInProgress();
    expect(current.runtime.readActiveContext().available).toBe(false);
  });

  it('does not permanently mark the real panel stale between the clear event and identity removal', () => {
    const t = tab(); const main = t.page({ main: true, realPanel: true });
    main.edit('G', 3);
    const render = vi.fn(() => main.runtime.readActiveContext());
    main.runtime.subscribe(render);
    t.clearInProgress();
    // The adapter publishes this before custom-fixes removes the old patient ID.
    // The real panel clears its known owner first, then the carrier notifies UI.
    main.win.dispatchEvent({ type: 'vilda:user-state-cleared' });
    expect(render).toHaveBeenCalled();
    expect(render.mock.results.at(-1).value.available).toBe(false);
    t.setPatient(null);
    main.fields.get('age').value = '';
    main.fields.get('ageMonths').value = '';
    t.clearInProgress(false);
    expect(main.win.VildaPanelPacjent.nieaktualny()).toBe(false);
    expect(main.state.capture().present).toBe(false);
    main.fields.get('age').value = '6';
    expect(main.edit('G', 2)).toEqual({ ok: true });
    t.setPatient('synthetic-other');
    expect(main.win.VildaPanelPacjent.nieaktualny()).toBe(true);
    expect(main.runtime.readActiveContext().available).toBe(false);
  });

  it('preserves the raw previous-sex observation without silently renewing the current selection', () => {
    const t = tab(); const main = t.page({ main: true }); main.edit('G', 3); const before = main.state.capture().raw;
    main.setSex('F'); main.save(); main.setSex('M'); main.save();
    const context = t.page().runtime.readActiveContext();
    expect(context.assessmentContext.assessment.observations.G).toEqual(before.observations.G);
    expect(context.gonadal).toMatchObject({ stage: null, current: false });
    main.edit('G', 3);
    expect(main.runtime.readActiveContext().gonadal).toMatchObject({ stage: 3, current: true });
  });
});
