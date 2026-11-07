import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { appSrc, funkcjaZ, zrodlo } from '../support/silnik-bmi.mjs';

function harness({ fallback = false, display = 'none', values = [] } = {}) {
  const inputs = new Map(['age', 'ageMonths', 'weight', 'height', 'sex'].map(id => [id, new EventTarget()]));
  const rows = values.map(values => ({ querySelector: selector => ({ value: values[selector] ?? '' }) }));
  const card = { style: { display }, hidden: false };
  const document = {
    getElementById: id => id === 'intakeCard' ? card : inputs.get(id) || null,
    querySelectorAll: () => rows,
  };
  const update = vi.fn();
  const win = { document, console, setTimeout: vi.fn(), _updateIntakeFirstRowFromUserBasics: update,
    _getAdvIntakeHandlerOptions: () => ({}), _getAdvIntakeHelperOptions: () => ({ document }),
    _refreshAdvIntakeRowUi: vi.fn(), debouncedIntakeCalc: vi.fn(),
  };
  for (const name of ['_syncAdvRowToIntake', '_syncIntakeRowToAdv', '_pairAdvancedAndIntakeRowsByOrder',
    'handleAdvancedMeasurementAdd', 'handleIntakeHistoryAdd', 'handleAdvancedMeasurementRowRemove', 'handleIntakeHistoryRowRemove']) win[name] = vi.fn();
  win.window = win; win.globalThis = win;
  const context = vm.createContext(win);
  vm.runInContext(zrodlo('vilda_advanced_growth.js'), context);
  win._callAdvIntakeHelper = (name, args, otherwise) => {
    if (fallback && name === 'setupAdvancedIntakeLiveWiring') return otherwise();
    return win.VildaAdvancedGrowth[name](...args);
  };
  for (const name of ['_intkRows', '_intakeRowHasAnyData', 'vildaUpdateIntakeCurrentRowFromBasicEvent',
    '_getAdvIntakeLiveWiringOptions', 'setupAdvancedIntakeLiveWiring']) {
    vm.runInContext(funkcjaZ(appSrc, name), context, { filename: `app.js:${name}` });
  }
  win.setupAdvancedIntakeLiveWiring();
  return { win, card, rows, update, event: (type = 'change') => inputs.get('height').dispatchEvent(new Event(type)) };
}

describe.each([false, true])('passive intake current-row creation, fallback=%s', fallback => {
  it('does not create history on replayed input/change in a closed empty card', () => {
    const h = harness({ fallback });
    h.event('input'); h.event('change'); h.event('change');
    expect(h.update).not.toHaveBeenCalled();
    expect(h.rows).toEqual([]);
  });

  it('does not turn an empty placeholder into a measurement', () => {
    const h = harness({ fallback, values: [{}] });
    h.event();
    expect(h.update).not.toHaveBeenCalled();
  });

  it.each(['0', '150', '1.5'])('preserves live updates with entered history, including %s', height => {
    const h = harness({ fallback, values: [{ '.intake-ht': height }] });
    h.event();
    expect(h.update).toHaveBeenCalledOnce();
    expect(h.rows[0].querySelector('.intake-ht').value).toBe(height);
  });

  it('updates an explicitly opened card and leaves the direct updater available', () => {
    const h = harness({ fallback, display: 'block' });
    h.event();
    expect(h.update).toHaveBeenCalledOnce();
    h.card.style.display = 'none';
    h.win._updateIntakeFirstRowFromUserBasics();
    expect(h.update).toHaveBeenCalledTimes(2);
  });
});
