import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { appSrc, funkcjaZ, zrodlo } from '../support/silnik-bmi.mjs';

// Real event/reset/calculation orchestrators and real window-state commit.
// The supplied calculation model is deliberately fictional: this suite tests
// producer invalidation, while the clinical engine has its own reference tests.
const HISTORY = [
  { ageMonths: 84, ageYears: 7, height: 123, weight: 24 },
  { ageMonths: 96, ageYears: 8, height: 128, weight: 28 },
  { ageMonths: 108, ageYears: 9, height: 134, weight: 31 },
  { ageMonths: 120, ageYears: 10, height: 140, weight: 34 },
  { ageMonths: 144, ageYears: 12, height: 151, weight: 42 },
];
const clone = value => JSON.parse(JSON.stringify(value));

function harness() {
  class Element extends EventTarget {
    constructor(id, value = '') { super(); this.id = id; this.value = value; this.style = {}; this.html = ''; }
  }
  const elements = new Map(Object.entries({ age: '12', ageMonths: '0', sex: 'M', weight: '42', height: '151' })
    .map(([id, value]) => [id, new Element(id, value)]));
  for (const id of ['intakeCard', 'intakeMeasurements', 'intakeResults']) elements.set(id, new Element(id));
  const doc = new EventTarget();
  doc.getElementById = id => elements.get(id) || null;
  const scope = { patientId: 'fictional-intake-owner', ownerId: 'fictional-account', sequence: 7, unlocked: true, sessionGeneration: 1 };
  function createVault() {
    const tokens = new WeakMap();
    return {
      getCurrentUser: () => ({ userId: scope.ownerId }), isUnlocked: () => scope.unlocked,
      captureSyncOperationSession() { const token = Object.freeze({}); tokens.set(token, scope.sessionGeneration); return token; },
      assertSyncOperationSession(token) {
        if (!tokens.has(token) || tokens.get(token) !== scope.sessionGeneration) throw new Error('SESSION_CHANGED');
        return true;
      },
    };
  }
  const win = {
    document: doc, Event, console,
    sessionStorage: { getItem: key => key === 'vildaCurrentPatientId' ? scope.patientId : null },
    VildaVault: createVault(),
    VildaDataImportExport: { getApplyLoadedDataSequence: () => scope.sequence },
    vildaAppClearHtml: el => { el.html = ''; },
    clearIntakeResultsAlertState: vi.fn(),
    vildaCancelIntakeRestoreCalculation: vi.fn(),
    vildaIntakeRestoreCalculationCommitted: vi.fn(),
    vildaLogSwallowedCatch: vi.fn(),
    buildEstimatedIntakeCalcInputModel: () => ({ rows: clone(HISTORY) }),
    buildEstimatedIntakeLastObservedModel: () => ({}),
    buildEstimatedIntakeCalculationModel: input => ({ rows: input.rows,
      commitPlan: { action: 'set', rows: input.rows, intakeKcalPerDay: 2362 } }),
    getEstimatedIntakeCalcOutputTargets: () => ({ res: elements.get('intakeResults') }),
    hideEstimatedIntakeLegend: vi.fn(),
    buildEstimatedIntakeResultsRenderModel: () => ({}),
    applyEstimatedIntakeResultsRenderModel: () => {
      elements.get('intakeResults').html = '2362 kcal';
      elements.get('intakeMeasurements').html = 'five fictional rows';
    },
    runEstimatedIntakePostRenderRisk: vi.fn(),
  };
  win.window = win; win.globalThis = win;
  const context = vm.createContext(win);
  vm.runInContext(zrodlo('vilda_estimated_intake_runtime.js'), context);
  win.clearEstimatedIntakeWindowState = () => win.VildaEstimatedIntakeRuntime.clearEstimatedIntakeWindowState();
  win.commitEstimatedIntakeCalcModelWindowState = model => win.VildaEstimatedIntakeRuntime.commitEstimatedIntakeCalcModelWindowState(model);
  vm.runInContext('let vildaIntakeUserResetBasis=null; let intakeAutofilledOnce=false;', context);
  for (const name of ['vildaReadIntakeUserResetBasis', 'vildaSameIntakeUserResetBasis',
    'vildaRememberIntakeUserResetBasis', 'vildaCopyVerifiedSaveReceipt', 'resetIntakeCard', 'shouldSuspendIntakeUserReset',
    'wireAutosyncIntakeWithUserData', 'calcEstimatedIntake']) {
    vm.runInContext(funkcjaZ(appSrc, name), context, { filename: `app.js:${name}` });
  }
  win.wireAutosyncIntakeWithUserData();
  win.calcEstimatedIntake();
  function event(id, type = 'change', value) {
    const el = elements.get(id);
    if (value !== undefined) el.value = value;
    el.dispatchEvent(new Event(type));
  }
  function patientLoaded(detail) {
    const event = new Event('vilda:patient-loaded');
    Object.defineProperty(event, 'detail', { value: detail }); doc.dispatchEvent(event);
  }
  function state() { return clone({ history: win.intakeHistory, kcal: win.intakeEstimatedKcalPerDay,
    rows: elements.get('intakeMeasurements').html, result: elements.get('intakeResults').html }); }
  return { win, scope, elements, event, patientLoaded, state, createVault };
}

describe('estimated intake: replay is not a patient edit', () => {
  it('retains exact five-row history and computed result across delayed input/change replay', () => {
    const h = harness(), before = h.state();
    expect(before.history).toHaveLength(5); expect(before.kcal).toBe(2362);
    for (const id of ['age', 'ageMonths', 'sex', 'weight', 'height']) {
      h.event(id, 'input'); h.event(id, 'change');
      expect(h.state()).toEqual(before);
    }
  });

  it.each(['age', 'ageMonths', 'sex', 'weight', 'height'])('real %s changes still clear the old result and table', id => {
    const h = harness();
    h.event(id, 'input', id === 'sex' ? 'F' : '1');
    expect(h.state()).toEqual({ history: null, kcal: null, rows: '', result: '' });
    h.win.calcEstimatedIntake();
    const recalculated = h.state();
    h.event(id, 'change');
    expect(h.state()).toEqual(recalculated);
  });

  it('treats equivalent accepted numeric formatting as unchanged, without accepting invalid prefixes', () => {
    const h = harness(), before = h.state();
    h.event('height', 'change', '151.00');
    h.event('weight', 'change', '4.2e1');
    expect(h.state()).toEqual(before);
    h.event('height', 'change', '151x');
    expect(h.win.intakeHistory).toBeNull();
  });

  it.each([['0', ''], ['', '0'], ['0', '-'], ['-', ''], ['1,5', '1.5']])(
    'distinguishes %j from %j', (before, after) => {
      const h = harness();
      h.elements.get('ageMonths').value = before;
      h.win.calcEstimatedIntake();
      h.event('ageMonths', 'change', after);
      expect(h.win.intakeHistory).toBeNull();
    },
  );

  it.each(['__vildaPersistRestoring', '__vildaSuspendIntakeUserReset'])('observes accepted %s events before a late identical replay', flag => {
    const h = harness();
    h.win[flag] = true; h.scope.sequence += 1;
    h.event('height', 'input', '152'); h.event('ageMonths', 'change', '1');
    h.win[flag] = false;
    const restored = h.state();
    h.event('height'); h.event('ageMonths');
    expect(h.state()).toEqual(restored);
    h.event('weight', 'input', '43');
    expect(h.win.intakeHistory).toBeNull();
  });

  it('accepts a silently restored basis only after an actual successful calculation commit', () => {
    const h = harness();
    h.scope.sequence += 1;
    h.elements.get('height').value = '152';
    h.win.calcEstimatedIntake();
    const calculated = h.state();
    h.event('height');
    expect(h.state()).toEqual(calculated);
  });

  it('does not bless changed inputs when calculation cannot commit or changes context during commit', () => {
    for (const failure of ['throw', 'no-target', 'changed-context']) {
      const h = harness();
      h.elements.get('height').value = '152';
      if (failure === 'throw') h.win.commitEstimatedIntakeCalcModelWindowState = () => { throw new Error('fictional commit refusal'); };
      if (failure === 'no-target') h.win.getEstimatedIntakeCalcOutputTargets = () => null;
      if (failure === 'changed-context') {
        const original = h.win.commitEstimatedIntakeCalcModelWindowState;
        h.win.commitEstimatedIntakeCalcModelWindowState = model => { const result = original(model); h.scope.sequence += 1; return result; };
      }
      h.win.calcEstimatedIntake(); h.event('height');
      expect(h.win.intakeHistory, failure).toBeNull();
    }
  });

  it.each(['patientId', 'ownerId', 'sequence', 'unlocked'])('invalidates the old result when %s changes despite equal measurements', key => {
    const h = harness();
    h.scope[key] = key === 'unlocked' ? false : key === 'sequence' ? 8 : 'another-fictional-owner';
    h.event('height'); expect(h.win.intakeHistory).toBeNull();
  });

  it('invalidates an old result after same-account lock/unlock between identical input replays', () => {
    const h = harness();
    h.scope.sessionGeneration += 1;
    h.event('height');
    expect(h.win.intakeHistory).toBeNull();
  });

  it('invalidates an old result if the Vault instance changes with the same account, patient and apply sequence', () => {
    const h = harness(); h.win.VildaVault = h.createVault();
    h.event('height');
    expect(h.win.intakeHistory).toBeNull();
  });

  it('allows the new key session to acquire a result only through an actual successful calculation commit', () => {
    const h = harness(); h.scope.sessionGeneration += 1;
    h.win.calcEstimatedIntake();
    const current = h.state(); h.event('height');
    expect(h.state()).toEqual(current);
  });

  it('only adopts a confirmed first save PID for the unchanged same-owner result', () => {
    const h = harness();
    h.scope.patientId = null; h.win.calcEstimatedIntake();
    const before = h.state(); h.scope.patientId = 'fictional-first-save';
    h.patientLoaded({ source: 'save', patientId: h.scope.patientId, applySequence: h.scope.sequence, referenceVerified: true });
    h.event('height'); expect(h.state()).toEqual(before);
  });

  it('adopts the first verified Save after a later native listener publishes PID', async () => {
    const h = harness(); h.scope.patientId = null; h.win.calcEstimatedIntake(); const before = h.state();
    h.win.document.addEventListener('vilda:patient-loaded', () => { h.scope.patientId = 'fictional-late-pid'; });
    const detail = { source: 'save', patientId: 'fictional-late-pid', applySequence: h.scope.sequence, referenceVerified: true };
    h.patientLoaded(detail); detail.patientId = 'mutated-after-dispatch';
    await Promise.resolve(); await Promise.resolve();
    h.event('height', 'input'); h.event('height', 'change'); expect(h.state()).toEqual(before);
  });

  it.each(['input', 'key', 'apply'])('does not adopt across a pending %s change after the Save event', async kind => {
    const h = harness(); h.scope.patientId = null; h.win.calcEstimatedIntake();
    h.patientLoaded({ source: 'save', patientId: 'fictional-late-pid', applySequence: h.scope.sequence, referenceVerified: true });
    if (kind === 'input') h.event('height', 'input', '152');
    if (kind === 'key') h.scope.sessionGeneration += 1;
    if (kind === 'apply') h.scope.sequence += 1;
    h.scope.patientId = 'fictional-late-pid'; await Promise.resolve(); await Promise.resolve();
    h.event('weight', 'change'); expect(h.win.intakeHistory).toBeNull();
  });

  it.each([
    { source: 'restore' }, { referenceVerified: false }, { patientId: 'stale-fictional-patient' }, { applySequence: 6 },
  ])('does not trust a stale or unconfirmed save notification: %j', change => {
    const h = harness();
    h.scope.patientId = null; h.win.calcEstimatedIntake();
    h.scope.patientId = 'fictional-first-save';
    h.patientLoaded({ source: 'save', patientId: h.scope.patientId, applySequence: h.scope.sequence, referenceVerified: true, ...change });
    h.event('height'); expect(h.win.intakeHistory).toBeNull();
  });

  it('does not use an unscoped restore notification to acknowledge a genuine silent change', () => {
    const h = harness(); h.elements.get('height').value = '152';
    h.win.document.dispatchEvent(new Event('vilda:main-session-restored'));
    h.event('height'); expect(h.win.intakeHistory).toBeNull();
  });

  it('keeps explicit reset unconditional even when every input is identical', () => {
    const h = harness(); h.win.resetIntakeCard();
    expect(h.state()).toEqual({ history: null, kcal: null, rows: '', result: '' });
  });
});
