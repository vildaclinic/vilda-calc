import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parse} from 'espree';
import {describe, expect, it, vi} from 'vitest';

function production(file, name) {
  const source = readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
  const tree = parse(source, {ecmaVersion:'latest', range:true}), found = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'FunctionDeclaration' && node.id?.name === name) found.push(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(tree);
  if (found.length !== 1) throw new Error('Ambiguous production editor: ' + name);
  return source.slice(...found[0].range);
}

describe('Automatic visit documentation refuses an unavailable encounter', () => {
  it('does not replace a treatment editor or create a general one when encounter acquisition is blocked', () => {
    const captureVisitBinding = vi.fn(() => ({blocked:true})), status = vi.fn();
    const oldEditor = {}, closeEditor = vi.fn(), ensureEditor = vi.fn(), submit = vi.fn();
    const owner = {patientId:'fictional-patient', phase:'ready', options:{captureVisitBinding}};
    const context = vm.createContext({current:() => true, status, activeEditor:oldEditor, closeEditor, ensureEditor});
    vm.runInContext(production('vilda_patient_treatment_ui.js', 'openEditor'), context);
    expect(context.openEditor(owner, {kind:'diagnosis', submit})).toBe(false);
    expect(captureVisitBinding).toHaveBeenCalledExactlyOnceWith('fictional-patient');
    expect(status.mock.calls[0][1]).toContain('Poczekaj na zakończenie operacji wizyty');
    expect(context.activeEditor).toBe(oldEditor);
    expect(closeEditor).not.toHaveBeenCalled(); expect(ensureEditor).not.toHaveBeenCalled(); expect(submit).not.toHaveBeenCalled();
  });

  it.each(['showEditor', 'stagedEditor'])('%s refuses the actual plan owner before building a writable dialog', name => {
    const captureVisitBinding = vi.fn(() => ({blocked:true})), notify = vi.fn(), node = vi.fn(), build = vi.fn(), submit = vi.fn();
    const context = vm.createContext({current:() => true, state:{editing:false, busy:false},
      options:{patientId:'fictional-card-patient', captureVisitBinding}, notify, node, stagedWritable:() => true});
    vm.runInContext(production('vilda_care_plans.js', name), context);
    expect(context[name]('Fikcyjny edytor', {patientId:'fictional-plan-patient'}, build, 'Zapisz', submit)).toBeNull();
    expect(captureVisitBinding).toHaveBeenCalledExactlyOnceWith('fictional-plan-patient');
    expect(notify.mock.calls[0][0]).toContain('Poczekaj na zakończenie operacji wizyty');
    expect(node).not.toHaveBeenCalled(); expect(build).not.toHaveBeenCalled(); expect(submit).not.toHaveBeenCalled();
    expect(context.state).toEqual({editing:false, busy:false});
  });

  it('requests a new fixed-patient plan binding without substituting another plan owner', () => {
    const captureVisitBinding = vi.fn(() => ({blocked:true}));
    const context = vm.createContext({current:() => true, state:{editing:false, busy:false},
      options:{patientId:'fictional-card-patient', captureVisitBinding}, notify:vi.fn()});
    vm.runInContext(production('vilda_care_plans.js', 'showEditor'), context);
    expect(context.showEditor('Fikcyjny nowy plan', null, vi.fn(), 'Utwórz plan', vi.fn())).toBeNull();
    expect(captureVisitBinding).toHaveBeenCalledExactlyOnceWith('fictional-card-patient');
  });
});
