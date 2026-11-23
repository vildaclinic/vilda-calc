import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parse} from 'espree';
import {describe, expect, it, vi} from 'vitest';

function production(file, name, select) {
  const source = readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
  const tree = parse(source, {ecmaVersion:'latest', range:true}), found = [];
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (value.type === 'FunctionDeclaration' && value.id?.name === name) found.push(value);
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === 'object') visit(child);
    }
  }
  visit(tree); expect(found).toHaveLength(1);
  return source.slice(...(select ? select(found[0]) : found[0]).range);
}

function one(root, predicate) {
  const found = [];
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (predicate(value)) found.push(value);
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === 'object') visit(child);
    }
  }
  visit(root); expect(found).toHaveLength(1); return found[0];
}

describe('patient panel automatic documentation binding acquisition', () => {
  it('preserves the exact active binding, genuine general scope and blocked state without creating a general fallback', () => {
    const binding = Object.freeze({visitContext:{visitId:'fictional-visit'}, isCurrent:() => true, ensureRecorded:async () => true});
    const capture = vi.fn(() => binding), w = {__VILDA_HOME_GABINET_PREVIEW__:true, VildaHomeEncounter:{captureDocumentationBinding:capture}};
    const context = vm.createContext({w});
    vm.runInContext(production('vilda_home_patient.js', 'documentationBinding'), context);
    expect(context.documentationBinding('fictional-patient')).toBe(binding);
    expect(capture).toHaveBeenLastCalledWith('fictional-patient');
    capture.mockReturnValue(null);
    expect(context.documentationBinding('other-patient')).toBeNull();
    w.VildaHomeGabinet = {captureDocumentationBinding:vi.fn(() => null)};
    capture.mockClear();
    expect(context.documentationBinding('fictional-patient')).toBeNull();
    expect(capture).not.toHaveBeenCalled();
    delete w.VildaHomeGabinet;
    const blocked = {blocked:true}; capture.mockReturnValue(blocked);
    expect(context.documentationBinding('fictional-patient')).toBe(blocked);
    delete w.VildaHomeEncounter;
    expect(context.documentationBinding('fictional-patient')).toEqual({blocked:true});
    w.__VILDA_HOME_GABINET_PREVIEW__ = false;
    expect(context.documentationBinding('fictional-patient')).toBeNull();
  });

  it('captures documentation in a same-patient native B1 view even outside inline, and refuses its expired owner', () => {
    const binding = {visitContext:{visitId:'fictional-visit'}}, capture = vi.fn(() => binding), mount = vi.fn(() => ({}));
    const w = {__VILDA_HOME_GABINET_PREVIEW__:true, VildaHomeEncounter:{captureDocumentationBinding:capture}, VildaPatientTreatment:{mount}};
    const context = vm.createContext({w, current:view => !view.expired});
    vm.runInContext(production('vilda_home_patient_native.js', 'mountTreatment'), context);
    const view = {patientId:'fictional-patient', patientName:'Fikcyjny Pacjent', treatmentBody:{}, legacy:[]};
    context.mountTreatment(view);
    const options = mount.mock.calls[0][1];
    expect(options.captureVisitBinding('fictional-patient')).toBe(binding);
    expect(options.captureVisitBinding('other-patient')).toEqual({blocked:true});
    view.expired = true;
    expect(options.captureVisitBinding('fictional-patient')).toEqual({blocked:true});
    expect(capture).toHaveBeenCalledTimes(1);
  });
});

function reminderContext(binding, encounter = {mode:'new', visitId:'fictional-visit', date:'2026-11-03'}) {
  const w = {VildaVault:{getCurrentUser:() => ({userId:'fictional-account'}), isUnlocked:() => true},
    VildaDataImportExport:{getApplyLoadedDataSequence:() => 7, isMainSessionRestorePending:() => false},
    VildaPanelPacjent:{nieaktualny:() => false, wlasciciel:() => 'fictional-patient'}, VildaAuthUI:{isBootReady:() => true},
    VildaProAccess:{hasAccess:() => true}, VildaHomeEncounter:{state:() => encounter, captureDocumentationBinding:vi.fn(() => binding)}};
  const context = vm.createContext({w, integrated:() => true, pageCurrent:() => true, patientId:() => 'fictional-patient', value:() => ''});
  vm.runInContext(production('vilda_home_reminders_runtime.js', 'captureDocumentationBinding') + '\n' +
    production('vilda_home_reminders_runtime.js', 'ownerSnapshot'), context);
  return {w, context};
}

describe('reminder panel distinguishes unavailable active visits from genuine general scope', () => {
  it('uses the verified visit identity and never infers it from a state date alone', () => {
    const binding = {visitContext:{visitId:'fictional-authoritative-visit', clinicalDateISO:'2026-11-04'}};
    const e = reminderContext(binding);
    expect(e.context.ownerSnapshot().encounter).toEqual({mode:'new', visitId:'fictional-authoritative-visit', date:'2026-11-04'});
    e.w.VildaHomeEncounter.captureDocumentationBinding.mockReturnValue(null);
    expect(e.context.ownerSnapshot()).toBeNull();
  });

  it.each([{blocked:true}, undefined])('keeps a blocked or unavailable acquisition inactive instead of allowing general writes (%j)', binding => {
    const e = reminderContext(binding);
    if (binding === undefined) delete e.w.VildaHomeEncounter.captureDocumentationBinding;
    expect(e.context.ownerSnapshot()).toBeNull();
  });

  it('permits patient-wide reminder work only for a genuine browse scope', () => {
    const e = reminderContext(null, {mode:'browse', busy:false});
    expect(e.context.ownerSnapshot()).toMatchObject({patientId:'fictional-patient', encounter:null});
  });
});

describe('native reminder creation forwards automatic documentation authority', () => {
  it('forwards exact normal and blocked bindings to the selected-plan mutation, and leaves general creation unchanged', () => {
    const expression = production('vilda_auth_ui.js', 'addReminder', fn => one(fn, value => value.type === 'CallExpression'
      && value.callee.object?.name === 'vault' && value.callee.property?.name === 'mutateCarePlan').arguments[1]);
    const binding = {visitContext:{visitId:'fictional-visit'}}, blocked = {blocked:true};
    const context = vm.createContext({HomeRemindersContext:{source:binding}});
    expect(vm.runInContext(expression, context)).toBe(binding);
    context.HomeRemindersContext.source = blocked;
    expect(vm.runInContext(expression, context)).toBe(blocked);
    context.HomeRemindersContext.source = {};
    expect(vm.runInContext(expression, context)).toBeUndefined();
    context.HomeRemindersContext = null;
    expect(vm.runInContext(expression, context)).toBeUndefined();
  });

  it('gives plans and templates the scoped callback without borrowing another patient or falling through a blocked visit', () => {
    const expression = production('vilda_auth_ui.js', 'mountCare', fn => {
      const call = one(fn, value => value.type === 'CallExpression' && value.callee.object?.name === 'module' && value.callee.property?.name === 'mount');
      return one(call.arguments[1], value => value.type === 'Property' && value.key?.name === 'captureVisitBinding').value;
    });
    const binding = {visitContext:{visitId:'fictional-visit'}}, blocked = {blocked:true};
    let current = true;
    const context = vm.createContext({HomeRemindersContext:{patientId:'fictional-patient', source:binding}, HomeRemindersCurrent:() => current});
    const capture = vm.runInContext('(' + expression + ')', context);
    expect(capture('fictional-patient')).toBe(binding);
    expect(capture('other-patient')).toBeNull();
    context.HomeRemindersContext.source = blocked;
    expect(capture('fictional-patient')).toBe(blocked);
    context.HomeRemindersContext.source = {encounter:{mode:'new'}};
    expect(capture('fictional-patient')).toEqual({blocked:true});
    context.HomeRemindersContext.source = {encounter:null};
    expect(capture('fictional-patient')).toBeNull();
    current = false;
    expect(capture('fictional-patient')).toEqual({blocked:true});
    context.HomeRemindersContext = null;
    expect(vm.runInContext('(' + expression + ')', context)).toBeUndefined();
  });

  it('requires a recorded active visit for a scoped independent reminder, preserving the same native current guard', () => {
    const expression = production('vilda_auth_ui.js', 'addReminder', fn => one(fn, value => value.type === 'CallExpression'
      && value.callee.object?.name === 'vault' && value.callee.property?.name === 'savePatientNoteOnce').arguments[1]);
    const current = vi.fn(() => true), context = vm.createContext({HomeRemindersContext:{}, HomeRemindersCurrent:current, visit:{visitId:'fictional-visit'}});
    expect(vm.runInContext(expression, context)).toMatchObject({isCurrent:current, requireActiveVisit:true});
    context.visit = null;
    expect(vm.runInContext(expression, context)).toMatchObject({isCurrent:current, requireActiveVisit:false});
    context.HomeRemindersContext = null;
    expect(vm.runInContext(expression, context)).toBeUndefined();
  });
});
