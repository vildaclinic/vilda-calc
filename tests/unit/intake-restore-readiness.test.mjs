import vm from 'node:vm';
import { parse } from 'acorn';
import { describe, expect, it, vi } from 'vitest';
import { appSrc, funkcjaZ, zrodlo } from '../support/silnik-bmi.mjs';

const CURRENT = { ageMonths: 156, ageYears: 13, height: 158, weight: 46 };
const HISTORY = { ageMonths: 120, ageYears: 10, height: 141, weight: 33 };
const clone = value => JSON.parse(JSON.stringify(value));

function harness() {
  const timers = [], elements = new Map(['intakeCard', 'intakeMeasurements', 'intakeResults'].map(id => [id, { style: {} }]));
  const data = { rows: [HISTORY, CURRENT], generation: 1, locked: false, throwModel: false, render: null };
  const win = {
    document: { getElementById: id => elements.get(id) || null, dispatchEvent: vi.fn() },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    setTimeout: vi.fn((callback, delay) => { const job = { callback, delay, cancelled: false }; timers.push(job); return job; }),
    clearTimeout: job => { if (job) job.cancelled = true; },
    vildaReadIntakeUserResetBasis: () => data.locked ? null : { generation: data.generation },
    vildaSameIntakeUserResetBasis: (a, b) => !!a && !!b && a.generation === b.generation,
    vildaRememberIntakeUserResetBasis: vi.fn(),
    buildEstimatedIntakeCalcInputModel: () => ({ rows: clone(data.rows) }),
    buildEstimatedIntakeLastObservedModel: () => ({}),
    buildEstimatedIntakeCalculationModel(input) {
      if (data.throwModel) throw new Error('fictional calculation failure');
      return { rows: input.rows, commitPlan: { action: input.rows.length ? 'set' : 'clear', rows: input.rows, intakeKcalPerDay: 1900 } };
    },
    getEstimatedIntakeCalcOutputTargets: () => ({ res: elements.get('intakeResults') }),
    hideEstimatedIntakeLegend() {}, clearIntakeResultsAlertState() {},
    buildEstimatedIntakeResultsRenderModel: () => ({}),
    applyEstimatedIntakeResultsRenderModel: () => data.render?.(),
    runEstimatedIntakePostRenderRisk: vi.fn(), vildaLogSwallowedCatch: vi.fn(),
    vildaAppClearHtml() {},
  };
  win.window = win; win.globalThis = win;
  const context = vm.createContext(win);
  vm.runInContext('let intakeTimer=null,intakeAutofilledOnce=false,vildaIntakeCalculationJob=null,vildaIntakeRunningCalculation=null,vildaIntakeRestoreCalculation=null,vildaGrowthHistoryRestoreState=null;', context);
  win.vildaReadGrowthHistoryOwner = () => ({ generation: data.generation });
  vm.runInContext(zrodlo('vilda_estimated_intake_runtime.js'), context);
  win.clearEstimatedIntakeWindowState = () => win.VildaEstimatedIntakeRuntime.clearEstimatedIntakeWindowState();
  win.commitEstimatedIntakeCalcModelWindowState = model => win.VildaEstimatedIntakeRuntime.commitEstimatedIntakeCalcModelWindowState(model);
  for (const name of ['vildaHasIntakeCalculationDom', 'vildaGetIntakeRestoreReadiness', 'vildaNotifyIntakeRestoreReadiness',
    'vildaCancelIntakeRestoreCalculation', 'vildaBeginIntakeRestoreCalculation', 'vildaFinishIntakeRestoreCalculation',
    'vildaIntakeRestoreCalculationCommitted', 'vildaRunIntakeCalculationJob', 'debouncedIntakeCalc', 'calcEstimatedIntake',
    'resetIntakeCard', 'vildaBeginGrowthHistoryRestore']) {
    vm.runInContext(funkcjaZ(appSrc, name), context, { filename: `app.js:${name}` });
  }
  win.intakeHistory = [clone(CURRENT)];
  function restore() { const token = win.vildaBeginIntakeRestoreCalculation(); win.debouncedIntakeCalc(); win.vildaFinishIntakeRestoreCalculation(token); return token; }
  return { win, data, timers, elements, restore, run: (index = timers.length - 1) => timers[index].callback(), readiness: () => win.vildaGetIntakeRestoreReadiness() };
}

describe('native intake restore calculation readiness', () => {
  it('blocks restored DOM until the already scheduled native model commits, without adding calculations or timers', () => {
    const h = harness(); h.restore();
    expect(h.readiness()).toEqual({ pending: true, failed: false });
    expect(h.win.intakeHistory).toEqual([CURRENT]); expect(h.timers).toHaveLength(1); expect(h.timers[0].delay).toBe(200);
    h.run();
    expect(h.readiness()).toEqual({ pending: false, failed: false });
    expect(h.win.intakeHistory).toEqual([HISTORY, CURRENT]); expect(h.win.intakeEstimatedKcalPerDay).toBe(1900);
    expect(h.timers).toHaveLength(1);
    expect(h.win.document.dispatchEvent.mock.calls.map(([event]) => ({ type: event.type, detail: event.detail }))).toEqual([
      { type: 'vilda:intake-restore-readiness', detail: { pending: true, failed: false } },
      { type: 'vilda:intake-restore-readiness', detail: { pending: false, failed: false } },
    ]);
  });

  it('keeps ordinary typing outside the restore barrier', () => {
    const h = harness(); h.win.debouncedIntakeCalc();
    expect(h.readiness()).toEqual({ pending: false, failed: false }); h.run();
    expect(h.win.document.dispatchEvent).not.toHaveBeenCalled();
  });

  it('finishes an unchanged replay whose complete model is already current', () => {
    const h = harness(); h.win.calcEstimatedIntake();
    const history = clone(h.win.intakeHistory), result = h.win.intakeEstimatedKcalPerDay;
    h.restore(); h.run();
    expect(h.readiness()).toEqual({ pending: false, failed: false });
    expect(h.win.intakeHistory).toEqual(history); expect(h.win.intakeEstimatedKcalPerDay).toBe(result);
    expect(h.timers).toHaveLength(1);
  });

  it('finishes immediately when the native finalizer scheduled no calculation', () => {
    const h = harness(), token = h.win.vildaBeginIntakeRestoreCalculation();
    h.win.vildaFinishIntakeRestoreCalculation(token);
    expect(h.readiness()).toEqual({ pending: false, failed: false }); expect(h.timers).toEqual([]);
  });

  it('follows replacement of the actual debounce job and rejects a retired callback', () => {
    const h = harness(); h.restore(); h.win.debouncedIntakeCalc();
    expect(h.timers[0].cancelled).toBe(true); h.run(0);
    expect(h.readiness().pending).toBe(true); expect(h.win.intakeHistory).toEqual([CURRENT]);
    h.run(1); expect(h.readiness()).toEqual({ pending: false, failed: false });
  });

  it('accepts the native insufficient-data clear as a completed result', () => {
    const h = harness(); h.data.rows = []; h.restore(); h.run();
    expect(h.win.intakeHistory).toBeNull(); expect(h.readiness()).toEqual({ pending: false, failed: false });
  });

  it.each(['model', 'commit'])('fails closed after a %s error and recovers through the next native calculation', kind => {
    const h = harness(), commit = h.win.commitEstimatedIntakeCalcModelWindowState;
    if (kind === 'model') h.data.throwModel = true;
    else h.win.commitEstimatedIntakeCalcModelWindowState = () => { throw new Error('fictional commit failure'); };
    h.restore();
    if (kind === 'model') expect(() => h.run()).toThrow('fictional calculation failure'); else h.run();
    expect(h.readiness()).toEqual({ pending: false, failed: true }); expect(h.win.intakeHistory).toEqual([CURRENT]);
    h.data.throwModel = false; h.win.commitEstimatedIntakeCalcModelWindowState = commit;
    h.win.debouncedIntakeCalc(); expect(h.readiness()).toEqual({ pending: true, failed: false }); h.run();
    expect(h.readiness()).toEqual({ pending: false, failed: false });
  });

  it('recovers a failed restore when an existing direct calculation commits successfully', () => {
    const h = harness(); h.data.throwModel = true; h.restore(); expect(() => h.run()).toThrow();
    h.data.throwModel = false; h.win.calcEstimatedIntake(); expect(h.readiness()).toEqual({ pending: false, failed: false });
  });

  it.each(['before', 'after'])('does not remain pending when output DOM is missing %s arming', when => {
    const h = harness();
    if (when === 'before') { h.elements.delete('intakeResults'); expect(h.win.vildaBeginIntakeRestoreCalculation()).toBeNull(); }
    else { h.restore(); h.elements.delete('intakeResults'); h.run(); }
    expect(h.readiness()).toEqual({ pending: false, failed: false });
  });

  it('retires the barrier on actual reset/Clear without changing the existing queued-calculation policy', () => {
    const h = harness(); h.restore(); h.win.resetIntakeCard();
    expect(h.readiness()).toEqual({ pending: false, failed: false }); expect(h.win.intakeHistory).toBeNull();
    expect(h.timers[0].cancelled).toBe(false);
  });

  it('does not let an old completion release a replacement restore', () => {
    const h = harness(); h.restore();
    h.data.render = () => { h.data.render = null; h.restore(); };
    h.run(0); expect(h.readiness()).toEqual({ pending: true, failed: false });
    h.run(1); expect(h.readiness()).toEqual({ pending: false, failed: false });
  });

  it('does not release after a reentrant input/scope change', () => {
    const h = harness(); h.restore(); h.data.render = () => { h.data.generation++; h.data.render = null; };
    h.run(); expect(h.readiness()).toEqual({ pending: false, failed: true });
    h.win.debouncedIntakeCalc(); h.run(); expect(h.readiness()).toEqual({ pending: false, failed: false });
  });

  it('allows a completed model during the same locked bootstrap without granting account authority', () => {
    const h = harness(); h.data.locked = true; h.restore(); h.run();
    expect(h.readiness()).toEqual({ pending: false, failed: false });
    expect(h.win.intakeHistory).toEqual([HISTORY, CURRENT]);
  });

  it('keeps the barrier through ordinary bootstrap unlock until its actual calculation commits', () => {
    const h = harness(); h.data.locked = true; h.restore(); h.data.locked = false;
    expect(h.readiness()).toEqual({ pending: true, failed: false }); h.run();
    expect(h.readiness()).toEqual({ pending: false, failed: false });
  });

  it.each([null, { advanced: true, basic: true, intake: true }])('retires old work at the actual accepted Clear/load boundary: %j', presence => {
    const h = harness(); h.restore(); h.data.generation++;
    h.win.vildaBeginGrowthHistoryRestore(presence);
    expect(h.readiness()).toEqual({ pending: false, failed: false });
    h.run(); expect(h.readiness()).toEqual({ pending: false, failed: false });
  });
});

describe('actual shared-restore finalizer boundary', () => {
  function finalizerSource() {
    const source = zrodlo('vilda_persist_runtime.js'), candidates = [];
    function visit(node) {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'ArrowFunctionExpression' && source.slice(node.start, node.end).includes('let intakeRestoreToken=')) candidates.push(node);
      for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') visit(value);
    }
    visit(parse(source, { ecmaVersion: 'latest' })); candidates.sort((a, b) => (a.end - a.start) - (b.end - b.start));
    return source.slice(candidates[0].start, candidates[0].end);
  }
  it.each([false, true])('arms before native pairing and finishes before scheduling persistence, pairing failure=%s', failure => {
    const order = [], token = {}, win = {
      vildaBeginIntakeRestoreCalculation: () => { order.push('begin'); return token; },
      vildaEnsureAdvancedIntakePairing: () => { order.push('pair'); if (failure) throw new Error('pair failed'); },
      reconcileGrowthHistoryModules: () => order.push('reconcile'), calculateBasicGrowth: () => order.push('basic'),
      vildaFinishIntakeRestoreCalculation: (actual, failed) => { expect(actual).toBe(token); expect(failed).toBe(failure); order.push('finish'); },
      vildaPersistScheduleSave: () => order.push('persist'),
    };
    new Function('window', `return (${finalizerSource()})();`)(win);
    expect(order).toEqual(['begin', 'pair', 'reconcile', 'basic', 'finish', 'persist']);
  });
});
