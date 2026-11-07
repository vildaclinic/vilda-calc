import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { appSrc, funkcjaZ, zrodlo } from '../support/silnik-bmi.mjs';

function harness() {
  const scope = { owner: 'fictional-owner', patient: 'fictional-patient', apply: 3, generation: 1 };
  const tokenGenerations = new WeakMap();
  const vault = {
    getCurrentUser: () => ({ userId: scope.owner }), isUnlocked: () => true,
    captureSyncOperationSession() { const token = Object.freeze({}); tokenGenerations.set(token, scope.generation); return token; },
    assertSyncOperationSession(token) {
      if (tokenGenerations.get(token) !== scope.generation) throw new Error('SESSION_CHANGED');
      return true;
    },
  };
  const elements = new Map();
  const rows = { advanced: [], basic: [], intake: [] };
  const containerIds = { advanced: 'advMeasurements', basic: 'basicGrowthMeasurements', intake: 'intakeMeasurements' };
  for (const source of Object.keys(rows)) elements.set(containerIds[source], { querySelectorAll: () => rows[source] });
  for (const [id, value] of Object.entries({ age: '13', ageMonths: '4', sex: 'M', weight: '', height: '' })) elements.set(id, { value });
  function add(source, values, metadata = {}) {
    const inputs = values.map((value, i) => ({ className: `field-${i}`, type: 'number', value, checked: false }));
    const selectors = { advanced: ['.adv-age-years', '.adv-age-months', '.adv-height', '.adv-weight'],
      basic: ['.bg-age-years', '.bg-age-months', '.bg-height', '.bg-weight'],
      intake: ['.intake-ageY', '.intake-ageM', '.intake-ht', '.intake-wt'] };
    const row = { inputs, dataset: { ...metadata }, querySelectorAll: () => inputs,
      querySelector(selector) { return inputs[selectors[source].indexOf(selector)] || null; },
      remove() { const index = rows[source].indexOf(this); if (index >= 0) rows[source].splice(index, 1); },
      getAttribute(name) { return name === 'data-gh-id' ? this.dataset.ghId || null : name === 'data-gh-sync' ? this.dataset.ghSync || null : null; } };
    rows[source].push(row); return row;
  }
  const win = {
    document: { getElementById: id => elements.get(id) || null,
      querySelectorAll: selector => selector === '#intakeMeasurements .measure-row-intake' ? rows.intake : [] },
    sessionStorage: { getItem: () => scope.patient }, VildaVault: vault,
    VildaDataImportExport: { getApplyLoadedDataSequence: () => scope.apply },
    _refreshAdvIntakeRowUi: vi.fn(),
    vildaCancelIntakeRestoreCalculation: vi.fn(),
    _pairAdvancedAndIntakeRowsByOrderUntracked: vi.fn(() => ({ paired: true, mutated: true })),
  };
  win.window = win; win.globalThis = win;
  const context = vm.createContext(win);
  vm.runInContext(zrodlo('vilda_estimated_intake.js'), context);
  vm.runInContext('let vildaGrowthHistoryRestoreState=null;', context);
  for (const name of ['vildaReadIntakeUserResetBasis', 'vildaSameIntakeUserResetBasis',
    'vildaReadGrowthHistoryOwner', 'vildaCurrentGrowthHistoryRestore',
    'vildaBeginGrowthHistoryRestore', 'vildaCommitGrowthHistoryRestore', 'vildaShouldPreserveRestoredGrowthSync',
    'vildaAdoptGrowthHistoryAcceptedLoadScope',
    'vildaCopyVerifiedSaveReceipt', 'vildaAdoptGrowthHistorySaveScope', 'vildaHandleGrowthHistorySaved',
    '_intkRows', '_intakeRowHasAnyData', '_rowHasAnyData', '_ensureAtLeastOneIntakeHistoryRow', '_pairAdvancedAndIntakeRowsByOrder']) {
    vm.runInContext(funkcjaZ(appSrc, name), context, { filename: `app.js:${name}` });
  }
  // Real basic-growth synchronization entry points. The table writers are
  // observable dependencies; their clinical calculation is outside this suite.
  Object.assign(win, {
    R: () => true, se: () => false, l: id => elements.get(id) || null,
    ce: (_source, callback) => { callback(); return true; },
    $: () => rows.basic, T: () => rows.advanced, Se: () => [], H() {}, B() {},
    Me: vi.fn(), Ae: vi.fn(), z: vi.fn(), ve: () => true,
    addAdvMeasurementRow() {}, calculateGrowthAdvanced: vi.fn(),
  });
  const basicSource = zrodlo('growth-basic-module.js');
  for (const name of ['J', 'K', 'Q']) vm.runInContext(funkcjaZ(basicSource, name), context);
  let nextId = 0;
  Object.assign(win, {
    _advRows: () => rows.advanced, _getIntakeHistoryRows: () => rows.intake.filter(row => row.dataset.locked !== 'true'),
    _getAdvIntakeSyncId: row => row?.dataset.advIntakeSyncId || '',
    _setAdvIntakeSyncId: (row, id) => { row.dataset.advIntakeSyncId = id; },
    _nextAdvIntakeSyncId: () => `new-native-pair-${++nextId}`,
    _runWithAdvIntakeSyncSuspended: callback => callback(), _isAdvIntakeSyncSuspended: () => false,
    _callAdvIntakeHelper: (_name, _args, fallback) => fallback(),
    _getAdvIntakeHelperOptions: () => ({}), _getAdvIntakeRowOperationOptions: options => options,
    _getAdvIntakePairingOptions: () => ({}),
    _getAdvIntakeHandlerOptions: () => ({}), _getRawInputValue: input => String(input?.value || ''),
    _isProtectedAdvancedHistoryRow: () => false, _isProtectedIntakeHistoryRow: () => false,
    _syncAdvancedGrowthMeasurementsFromDom() {}, _notifyAdvIntakeHistoryMutated() {},
    addAdvMeasurementRow: vi.fn(() => add('advanced', ['', '', '', ''])),
    intakeAddRow: vi.fn(() => add('intake', ['', '', '', ''])), debouncedIntakeCalc: vi.fn(),
  });
  for (const name of ['vildaFindCreatedGrowthHistoryPair', 'vildaCanSyncCreatedGrowthHistoryRow', 'vildaCreateOwnedGrowthHistoryPair',
    '_findAdvRowBySyncId', '_findIntakeHistoryRowBySyncId', '_syncAdvRowToIntake', '_syncIntakeRowToAdv',
    'handleAdvancedMeasurementAdd', '_handleAdvancedMeasurementAddUntracked', 'handleIntakeHistoryAdd',
    '_handleIntakeHistoryAddUntracked', 'handleAdvancedMeasurementRowRemove', 'handleIntakeHistoryRowRemove']) {
    vm.runInContext(funkcjaZ(appSrc, name), context, { filename: `app.js:${name}` });
  }
  const originalAdvanced = add('advanced', ['10', '0', '141', '33', '9', 'Fikcyjna adnotacja']);
  const originalBasic = add('basic', ['8', '6', '131.7', '29.1']);
  const originalIntake = add('intake', ['12', '6', '156.2', '44.4']);
  function begin(presence = { advanced: true, basic: true, intake: true }) { return win.vildaBeginGrowthHistoryRestore(presence); }
  function commit(token) { return win.vildaCommitGrowthHistoryRestore(token); }
  return { win, scope, rows, elements, add, begin, commit, originalAdvanced, originalBasic, originalIntake };
}

describe('accepted restoration is not a cross-history edit', () => {
  it.each(['loading', 'committed'])('continues only the original accepted-load token across its own PID publication (%s)', phase => {
    const h = harness(); h.scope.patient = null;
    const token = h.begin();
    if (phase === 'committed') expect(h.commit(token)).toBe(true);
    const original = h.win.vildaCurrentGrowthHistoryRestore();
    const originalProof = original.owner.sessionToken;
    h.scope.patient = 'accepted-native-target';
    expect(h.win.vildaCurrentGrowthHistoryRestore()).toBeNull();
    expect(h.win.vildaAdoptGrowthHistoryAcceptedLoadScope(token, h.scope.patient)).toBe(true);
    const continued = h.win.vildaCurrentGrowthHistoryRestore();
    expect(continued).toBe(original);
    expect(continued.owner.sessionToken).toBe(originalProof);
    expect(continued.loading).toBe(phase === 'loading');
    expect(continued.token).toBe(token);
    expect(h.rows.advanced).toEqual([h.originalAdvanced]);
    expect(h.rows.basic).toEqual([h.originalBasic]);
    expect(h.rows.intake).toEqual([h.originalIntake]);
    expect(h.commit(token)).toBe(true);
  });

  it.each(['wrong-token', 'wrong-patient', 'key', 'lock', 'apply', 'account', 'vault', 'new-operation', 'clear'])(
    'rejects accepted-load continuation after %s without accepting a stale scope', boundary => {
      const h = harness(), token = h.begin(), original = h.win.vildaCurrentGrowthHistoryRestore();
      h.scope.patient = 'accepted-native-target';
      if (boundary === 'key') h.scope.generation += 1;
      if (boundary === 'lock') h.win.VildaVault.isUnlocked = () => false;
      if (boundary === 'apply') h.scope.apply += 1;
      if (boundary === 'account') h.scope.owner = 'other-fictional-owner';
      if (boundary === 'vault') h.win.VildaVault = { ...h.win.VildaVault };
      if (boundary === 'new-operation') h.begin();
      if (boundary === 'clear') h.win.vildaBeginGrowthHistoryRestore(null);
      expect(h.win.vildaAdoptGrowthHistoryAcceptedLoadScope(boundary === 'wrong-token' ? {} : token,
        boundary === 'wrong-patient' ? 'wrong-target' : h.scope.patient)).toBe(false);
      expect(original.owner.patientId).toBe('fictional-patient');
      expect(original.loading).toBe(true);
    },
  );

  it('blocks passive copying before hydration completes and after the accepted baseline is committed', () => {
    const h = harness(), token = h.begin();
    for (const phase of ['loading', 'committed']) {
      if (phase === 'committed') expect(h.commit(token)).toBe(true);
      expect(h.win._pairAdvancedAndIntakeRowsByOrder()).toMatchObject({ skipped: true });
      expect(h.win.J()).toBe(false); expect(h.win.K()).toBe(false); expect(h.win.Q('advanced')).toBe(false);
    }
    expect(h.win._pairAdvancedAndIntakeRowsByOrderUntracked).not.toHaveBeenCalled();
    expect(h.win.Me).not.toHaveBeenCalled(); expect(h.win.Ae).not.toHaveBeenCalled();
    expect(h.rows.advanced).toEqual([h.originalAdvanced]);
    expect(h.rows.basic).toEqual([h.originalBasic]); expect(h.rows.intake).toEqual([h.originalIntake]);
  });

  it('keeps an explicitly empty independent history empty', () => {
    const h = harness(); h.rows.intake.length = 0; h.rows.basic.length = 0;
    const token = h.begin(); h.commit(token);
    h.win._pairAdvancedAndIntakeRowsByOrder(); h.win.K();
    expect(h.rows.intake).toEqual([]); expect(h.rows.basic).toEqual([]);
    expect(h.win.Ae).not.toHaveBeenCalled();
  });

  it.each(['loading', 'committed'])('restores only the blank intake editor without clinical or pairing effects (%s)', phase => {
    const h = harness(); h.rows.intake.length = 0;
    const current = h.add('intake', ['9', '0', '135', '40'], { locked: 'true' });
    const token = h.begin(); if (phase === 'committed') h.commit(token);
    h.win.intakeHistory = [{ ageMonths: 108, ageYears: 9, height: 135, weight: 40 }];
    h.win.advancedGrowthData = { measurements: [{ ageMonths: 120, height: 141, weight: 33 }] };
    h.win.basicGrowthData = { measurements: [{ ageMonths: 102, height: 131.7, weight: 29.1 }] };
    const model = () => JSON.stringify({ intake: h.win.intakeHistory, advanced: h.win.advancedGrowthData, basic: h.win.basicGrowthData });
    const before = model(), readRows = () => h.win.VildaEstimatedIntake.readIntakeRows({ document: h.win.document });
    const measured = readRows();
    expect(measured).toHaveLength(1);
    h.win._pairAdvancedAndIntakeRowsByOrder(); h.win._pairAdvancedAndIntakeRowsByOrder();
    expect(h.rows.intake).toHaveLength(2); expect(h.rows.intake[0]).toBe(current);
    expect(h.rows.intake[1].inputs.map(input => input.value)).toEqual(['', '', '', '']);
    expect(h.rows.intake[1].dataset).toEqual({});
    expect(h.win.intakeAddRow).toHaveBeenCalledExactlyOnceWith();
    expect(readRows()).toEqual(measured); expect(model()).toBe(before);
    expect(h.rows.advanced).toEqual([h.originalAdvanced]); expect(h.rows.basic).toEqual([h.originalBasic]);
    expect(h.win._pairAdvancedAndIntakeRowsByOrderUntracked).not.toHaveBeenCalled();
    expect(h.win.calculateGrowthAdvanced).not.toHaveBeenCalled(); expect(h.win.debouncedIntakeCalc).not.toHaveBeenCalled();
  });

  it.each(['empty-current', 'unlocked', 'stale-key', 'missing-container'])(
    'does not create an editor without a current owned measurement: %s', boundary => {
      const h = harness(); h.rows.intake.length = 0;
      h.add('intake', boundary === 'empty-current' ? ['', '', '', ''] : ['9', '0', '135', '40'],
        boundary === 'unlocked' ? {} : { locked: 'true' });
      const token = h.begin(); h.commit(token);
      if (boundary === 'stale-key') h.scope.generation += 1;
      if (boundary === 'missing-container') h.elements.delete('intakeMeasurements');
      h.win._pairAdvancedAndIntakeRowsByOrder();
      expect(h.rows.intake).toHaveLength(1); expect(h.win.intakeAddRow).not.toHaveBeenCalled();
      expect(h.win._pairAdvancedAndIntakeRowsByOrderUntracked).not.toHaveBeenCalled();
    },
  );

  it('keeps explicit numeric zero distinct from an empty current editor', () => {
    const h = harness(); h.rows.intake.length = 0;
    h.add('intake', ['0', '', '', ''], { locked: 'true' });
    const token = h.begin(); h.commit(token); h.win._pairAdvancedAndIntakeRowsByOrder();
    expect(h.rows.intake).toHaveLength(2);
    expect(h.rows.intake[0].inputs.map(input => input.value)).toEqual(['0', '', '', '']);
    expect(h.rows.intake[1].inputs.map(input => input.value)).toEqual(['', '', '', '']);
    expect(h.win.VildaEstimatedIntake.readIntakeRows({ document: h.win.document })).toEqual([]);
  });

  it('retains legacy derivation when the target history was absent', () => {
    const h = harness(), token = h.begin({ advanced: true, basic: false, intake: false }); h.commit(token);
    h.win._pairAdvancedAndIntakeRowsByOrder(); h.win.K();
    expect(h.win._pairAdvancedAndIntakeRowsByOrderUntracked).toHaveBeenCalledOnce();
    expect(h.win.Ae).toHaveBeenCalledOnce();
  });

  it('does not remove, combine or reorder duplicate-age observations or annotation metadata', () => {
    const h = harness();
    const second = h.add('advanced', ['10', '0', '141.1', '33', '9.2', 'Druga adnotacja'], { ghId: 'fictional-gh', ghSync: 'true' });
    const token = h.begin(); h.commit(token);
    h.win._pairAdvancedAndIntakeRowsByOrder(); h.win.K();
    expect(h.rows.advanced).toEqual([h.originalAdvanced, second]);
    expect(second.inputs[5].value).toBe('Druga adnotacja'); expect(second.dataset.ghId).toBe('fictional-gh');
  });

  it('ignores the locked current intake row when deciding whether history changed', () => {
    const h = harness(), current = h.add('intake', ['13', '4', '158', '75'], { locked: 'true' });
    const token = h.begin(); h.commit(token); current.inputs[2].value = '159';
    expect(h.win._pairAdvancedAndIntakeRowsByOrder()).toMatchObject({ skipped: true });
  });

  it.each(['value', 'annotation', 'ghId', 'add', 'remove'])('keeps a real %s edit in its explicitly restored source', kind => {
    const h = harness(), token = h.begin(); h.commit(token);
    if (kind === 'value') h.originalAdvanced.inputs[2].value = '142';
    if (kind === 'annotation') h.originalAdvanced.inputs[5].value = 'Zmieniona adnotacja';
    if (kind === 'ghId') h.originalAdvanced.dataset.ghId = 'changed-fictional-gh';
    if (kind === 'add') h.add('advanced', ['9', '0', '135', '30']);
    if (kind === 'remove') h.rows.advanced.length = 0;
    h.win._pairAdvancedAndIntakeRowsByOrder();
    expect(h.win._pairAdvancedAndIntakeRowsByOrderUntracked).not.toHaveBeenCalled();
    expect(h.win._pairAdvancedAndIntakeRowsByOrder()).toMatchObject({ skipped: true });
  });

  it('retains basic edits and explicit clear locally without replacing advanced rows', () => {
    const h = harness(), token = h.begin(); h.commit(token);
    h.originalBasic.inputs[2].value = '132';
    expect(h.win.J()).toBe(false);
    h.rows.basic.length = 0;
    expect(h.win.J()).toBe(false);
    expect(h.win.Me).not.toHaveBeenCalled();
    expect(h.rows.advanced).toEqual([h.originalAdvanced]);
  });

  it('does not treat focus or validation CSS classes as changed clinical history', () => {
    const h = harness(), token = h.begin(); h.commit(token);
    h.originalAdvanced.inputs[2].className += ' focused is-valid _glass-input';
    h.originalAdvanced.inputs[2].id = 'cosmetic-generated-id';
    expect(h.win._pairAdvancedAndIntakeRowsByOrder()).toMatchObject({ skipped: true });
    expect(h.win.K()).toBe(false);
  });

  it('adopts only a verified first own Save PID without reclassifying restored rows', () => {
    const h = harness(); h.scope.patient = null;
    const token = h.begin(); h.commit(token);
    h.scope.patient = 'fictional-first-saved-patient';
    expect(h.win.vildaAdoptGrowthHistorySaveScope({ source: 'save', referenceVerified: true,
      patientId: h.scope.patient, applySequence: h.scope.apply })).toBe(true);
    expect(h.win._pairAdvancedAndIntakeRowsByOrder()).toMatchObject({ skipped: true });
    h.originalAdvanced.inputs[2].value = '142';
    expect(h.win.vildaShouldPreserveRestoredGrowthSync('advanced', 'basic')).toBe(true);
  });

  it.each([{ source: 'restore' }, { referenceVerified: false }, { patientId: 'stale-patient' }, { applySequence: 2 }])(
    'rejects a stale or unverified first Save scope notification: %j', changed => {
      const h = harness(); h.scope.patient = null;
      const token = h.begin(); h.commit(token); h.scope.patient = 'fictional-first-saved-patient';
      expect(h.win.vildaAdoptGrowthHistorySaveScope({ source: 'save', referenceVerified: true,
        patientId: h.scope.patient, applySequence: h.scope.apply, ...changed })).toBe(false);
      expect(h.commit(token)).toBe(false);
      expect(h.win._pairAdvancedAndIntakeRowsByOrder()).toMatchObject({ skipped: true });
    },
  );

  it('adopts a verified first Save once after the later PID publisher without rebinding restored rows', async () => {
    const h = harness(); h.scope.patient = null; const token = h.begin(); h.commit(token);
    const detail = { source: 'save', referenceVerified: true, patientId: 'fictional-late-pid', applySequence: h.scope.apply };
    h.win.vildaHandleGrowthHistorySaved({ detail }); detail.patientId = 'mutated-receipt';
    h.scope.patient = 'fictional-late-pid'; await Promise.resolve(); await Promise.resolve();
    expect(h.commit(token)).toBe(true); expect(h.win.handleAdvancedMeasurementAdd()).toBe(true);
    expect(h.rows.basic).toEqual([h.originalBasic]);
  });

  it.each(['restore', 'key', 'apply'])('rejects the delayed verified Save after a competing %s boundary', async kind => {
    const h = harness(); h.scope.patient = null; const token = h.begin(); h.commit(token);
    h.win.vildaHandleGrowthHistorySaved({ detail: { source: 'save', referenceVerified: true,
      patientId: 'fictional-late-pid', applySequence: h.scope.apply } });
    if (kind === 'restore') h.begin();
    if (kind === 'key') h.scope.generation += 1;
    if (kind === 'apply') h.scope.apply += 1;
    h.scope.patient = 'fictional-late-pid'; await Promise.resolve(); await Promise.resolve();
    expect(h.commit(token)).toBe(false); expect(h.win.handleAdvancedMeasurementAdd()).toBe(false);
  });

  it('keeps source ownership while adopting an authorized first Save', () => {
    const h = harness(); h.scope.patient = null;
    const token = h.begin(); h.commit(token);
    h.originalAdvanced.inputs[2].value = '142'; h.scope.patient = 'fictional-first-saved-patient';
    expect(h.win.vildaAdoptGrowthHistorySaveScope({ source: 'save', referenceVerified: true,
      patientId: h.scope.patient, applySequence: h.scope.apply })).toBe(true);
    expect(h.win.vildaShouldPreserveRestoredGrowthSync('advanced', 'basic')).toBe(true);
  });

  it('does not unfreeze old histories after lock/unlock or let a save notification adopt a changed key session', () => {
    const h = harness(); h.scope.patient = null;
    const token = h.begin(); h.commit(token);
    h.scope.generation += 1; h.scope.patient = 'fictional-first-saved-patient';
    expect(h.win.vildaAdoptGrowthHistorySaveScope({ source: 'save', referenceVerified: true,
      patientId: h.scope.patient, applySequence: h.scope.apply })).toBe(false);
    expect(h.commit(token)).toBe(false);
    expect(h.win._pairAdvancedAndIntakeRowsByOrder()).toMatchObject({ skipped: true });
    expect(h.win.K()).toBe(false);
    const accepted = h.begin(); expect(h.commit(accepted)).toBe(true);
    h.originalAdvanced.inputs[2].value = '142';
    expect(h.win.vildaShouldPreserveRestoredGrowthSync('advanced', 'basic')).toBe(true);
  });

  it('repeated accepted finalizers keep an intervening edit source-owned', () => {
    const h = harness(), token = h.begin(); h.commit(token);
    h.originalAdvanced.inputs[2].value = '142';
    expect(h.commit(token)).toBe(true);
    expect(h.win.vildaShouldPreserveRestoredGrowthSync('advanced', 'basic')).toBe(true);
  });

  it('does not infer links from equal measurements, duplicate ages, or passive native IDs', () => {
    const h = harness();
    h.originalIntake.inputs.forEach((input, i) => { input.value = h.originalAdvanced.inputs[i].value; });
    h.originalAdvanced.dataset.advIntakeSyncId = 'old-order-pair';
    h.originalIntake.dataset.advIntakeSyncId = 'old-order-pair';
    const token = h.begin(); h.commit(token);
    h.originalAdvanced.inputs[2].value = '142';
    h.win._syncAdvRowToIntake(h.originalAdvanced);
    expect(h.originalIntake.inputs[2].value).toBe('141');
    expect(h.win.handleAdvancedMeasurementRowRemove(h.originalAdvanced)).toBe(true);
    expect(h.rows.intake).toEqual([h.originalIntake]);
  });

  it.each(['advanced', 'intake'])('keeps newly created %s pairs linked before calculation and across repeated edits/deletion', source => {
    const h = harness(), token = h.begin(); h.commit(token);
    h.win.calculateGrowthAdvanced.mockImplementation(() => {
      const row = h.rows.advanced.at(-1);
      expect(h.win._findIntakeHistoryRowBySyncId(row.dataset.advIntakeSyncId)).toBe(h.rows.intake.at(-1));
    });
    expect(source === 'advanced' ? h.win.handleAdvancedMeasurementAdd() : h.win.handleIntakeHistoryAdd()).toBe(true);
    h.win.calculateGrowthAdvanced.mockReset();
    expect(h.win.addAdvMeasurementRow).toHaveBeenCalledWith({ skipInitialRecalc: true });
    const advanced = h.rows.advanced.at(-1), intake = h.rows.intake.at(-1);
    ['9', '0', '136', '32'].forEach((value, i) => { advanced.inputs[i].value = value; });
    h.win._syncAdvRowToIntake(advanced); h.win._syncAdvRowToIntake(advanced);
    expect(intake.inputs.map(input => input.value)).toEqual(['9', '0', '136', '32']);
    intake.inputs[2].value = '137'; h.win._syncIntakeRowToAdv(intake);
    expect(advanced.inputs[2].value).toBe('137');
    expect(h.rows.advanced).toHaveLength(2); expect(h.rows.intake).toHaveLength(2);
    expect(h.rows.basic).toEqual([h.originalBasic]);
    expect(h.win.handleIntakeHistoryRowRemove(intake)).toBe(true);
    expect(h.rows.advanced).toEqual([h.originalAdvanced]); expect(h.rows.intake).toEqual([h.originalIntake]);
  });

  it.each(['throw', 'missing-return'])('rolls back both newly added rows when the second creation fails: %s', failure => {
    const h = harness(), token = h.begin(); h.commit(token);
    h.win.intakeAddRow.mockImplementationOnce(() => {
      h.add('intake', ['', '', '', '']);
      if (failure === 'throw') throw new Error('synthetic row creation failure');
      return undefined;
    });
    if (failure === 'throw') expect(() => h.win.handleAdvancedMeasurementAdd()).toThrow('synthetic row creation failure');
    else expect(h.win.handleAdvancedMeasurementAdd()).toBe(false);
    expect(h.rows.advanced).toEqual([h.originalAdvanced]); expect(h.rows.intake).toEqual([h.originalIntake]);
    expect(h.win.calculateGrowthAdvanced).not.toHaveBeenCalled();
  });

  it('does not reconstruct new-row links after another accepted Restore or F5 hydration', () => {
    const h = harness(), token = h.begin(); h.commit(token); h.win.handleAdvancedMeasurementAdd();
    const advanced = h.rows.advanced.at(-1), intake = h.rows.intake.at(-1);
    advanced.inputs[2].value = '136'; h.win._syncAdvRowToIntake(advanced);
    const restored = h.begin(); h.commit(restored);
    advanced.inputs[2].value = '137'; h.win._syncAdvRowToIntake(advanced);
    expect(intake.inputs[2].value).toBe('136');
  });

  it('does not let an unregistered row impersonate a created pair by copying its ID', () => {
    const h = harness(), token = h.begin(); h.commit(token); h.win.handleAdvancedMeasurementAdd();
    const advanced = h.rows.advanced.at(-1), intake = h.rows.intake.at(-1);
    h.originalAdvanced.dataset.advIntakeSyncId = advanced.dataset.advIntakeSyncId;
    h.originalAdvanced.inputs[2].value = '142'; h.win._syncAdvRowToIntake(h.originalAdvanced);
    expect(intake.inputs[2].value).toBe('');
    h.win.handleAdvancedMeasurementRowRemove(h.originalAdvanced);
    expect(h.rows.advanced).toContain(advanced); expect(h.rows.intake).toContain(intake);
  });

  it('blocks stale created-pair lookup after a key-session change', () => {
    const h = harness(), token = h.begin(); h.commit(token); h.win.handleAdvancedMeasurementAdd();
    const advanced = h.rows.advanced.at(-1), intake = h.rows.intake.at(-1);
    h.scope.generation += 1; advanced.inputs[2].value = '137'; h.win._syncAdvRowToIntake(advanced);
    expect(intake.inputs[2].value).toBe(''); expect(h.win.handleAdvancedMeasurementAdd()).toBe(false);
  });

  it('rejects stale finalizers after a newer accepted restore or actual Clear', () => {
    const h = harness(), old = h.begin(), current = h.begin();
    expect(h.commit(old)).toBe(false); expect(h.commit(current)).toBe(true);
    h.begin(null); expect(h.commit(current)).toBe(false);
    h.win._pairAdvancedAndIntakeRowsByOrder();
    expect(h.win._pairAdvancedAndIntakeRowsByOrderUntracked).toHaveBeenCalledOnce();
  });

  it.each(['owner', 'patient', 'apply', 'generation'])('rejects a finalizer from the previous %s scope', key => {
    const h = harness(), token = h.begin();
    h.scope[key] = typeof h.scope[key] === 'number' ? h.scope[key] + 1 : 'another-fictional-owner';
    expect(h.commit(token)).toBe(false);
  });
});
