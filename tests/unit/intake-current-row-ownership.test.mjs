import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { appSrc, funkcjaZ } from '../support/silnik-bmi.mjs';

// The native F5 regression restores this fictional archive while main height
// and weight are blank. A later restore event must not turn it into a blank,
// locked current measurement. Run the production getter and row synchronizer.
const SELECTORS = ['.intake-ageY', '.intake-ageM', '.intake-ht', '.intake-wt'];

function harness(basics = { age: '13', ageMonths: '4', height: '', weight: '' }) {
  const rows = [], elements = new Map(Object.entries(basics).map(([id, value]) => [id, { value }]));
  const container = { get firstChild() { return rows[0] || null; },
    insertBefore(node, before) { const previous = rows.indexOf(node); if (previous >= 0) rows.splice(previous, 1);
      const index = rows.indexOf(before); rows.splice(index < 0 ? 0 : index, 0, node); return node; } };
  elements.set('intakeMeasurements', container);
  function row(values = ['13', '4', '158', '75'], dataset = { advIntakeSyncId: 'fictional-archive-id' }) {
    const inputs = new Map(SELECTORS.map((selector, i) => [selector, { value: values[i], disabled: false }]));
    const remove = { style: { display: 'inline-block' } };
    const node = {
      dataset: { ...dataset },
      querySelector: selector => selector === '.remove-intake-row' ? remove : inputs.get(selector) || null,
      querySelectorAll: selector => selector === 'input' ? [...inputs.values()] : [],
      remove() { rows.splice(rows.indexOf(node), 1); },
    };
    rows.push(node); return node;
  }
  const win = {
    document: {
      getElementById: id => elements.get(id) || null,
      querySelectorAll: selector => selector === '#intakeMeasurements .measure-row-intake' ? rows : [],
    },
    getVildaAdvancedGrowthAdapter: () => null,
    updateIntakeRemoveButtons: vi.fn(), vildaAppClearHtml: () => { rows.length = 0; }, intakeUpdatePalDesc() {},
    intakeAddRow: (data, options) => {
      const values = data ? [String(Math.floor(data.ageMonths / 12)), String(data.ageMonths % 12), String(data.height), String(data.weight)] : ['', '', '', ''];
      return row(values, options?.current === true ? { locked: 'true' } : {});
    },
  };
  win.window = win; win.globalThis = win;
  const context = vm.createContext(win);
  vm.runInContext("let intakeAutofilledOnce=false;", context);
  for (const name of ['_getAdvIntakeHelperOptions', '_callAdvIntakeHelper', '_getUserBasics', '_intkRows',
    '_setAdvIntakeSyncId', '_rowHasAnyData', '_intakeRowHasAnyData', '_lockIntakeFirstRow',
    '_updateIntakeFirstRowFromUserBasics', 'getUserBasics', 'intakeAutofill']) {
    vm.runInContext(funkcjaZ(appSrc, name), context, { filename: `app.js:${name}` });
  }
  function snapshot() {
    return rows.map(r => ({ dataset: { ...r.dataset }, inputs: SELECTORS.map(selector => ({ ...r.querySelector(selector) })),
      remove: { ...r.querySelector('.remove-intake-row').style } }));
  }
  return { win, rows, elements, row, snapshot, update: () => win._updateIntakeFirstRowFromUserBasics() };
}

describe('intake current row requires actual current measurements', () => {
  it('preserves the restored independent archive, its identity and metadata while both main measurements are blank', () => {
    const h = harness(), archived = h.row(), before = h.snapshot();
    expect(h.win._getUserBasics()).toEqual({ ageMonths: 160, height: null, weight: null });
    h.update(); h.update();
    expect(h.rows).toEqual([archived]);
    expect(h.snapshot()).toEqual(before);
  });

  it.each([
    { age: '', ageMonths: '', height: '158', weight: '75' },
    { age: '13', ageMonths: '4', height: '', weight: '75' },
    { age: '13', ageMonths: '4', height: '158', weight: '' },
    { age: '13', ageMonths: '4', height: 'Infinity', weight: '75' },
  ])('does not overwrite history for an incomplete or nonfinite current basis: %j', basics => {
    const h = harness(basics); h.row();
    const before = h.snapshot(); h.update();
    expect(h.snapshot()).toEqual(before);
  });

  it('retains the explicit numeric zero contract instead of equating zero with missing input', () => {
    const h = harness({ age: '0', ageMonths: '0', height: '0', weight: '0' });
    const current = h.row(['', '', '', ''], { locked: 'true' });
    h.update();
    expect(h.rows).toEqual([current]);
    expect(SELECTORS.map(selector => current.querySelector(selector).value)).toEqual(['0', '0', '0', '0']);
    expect(current.dataset.locked).toBe('true');
  });

  it('still updates an existing current row when genuine finite measurements change', () => {
    const h = harness({ age: '14', ageMonths: '2', height: '160', weight: '76' });
    const current = h.row(['13', '4', '158', '75'], { locked: 'true' });
    h.update();
    expect(SELECTORS.map(selector => current.querySelector(selector).value)).toEqual(['14', '2', '160', '76']);
    expect(SELECTORS.every(selector => current.querySelector(selector).disabled)).toBe(true);
  });

  it('creates one separate current row when DOB supplies complete basics after an archived row was restored', () => {
    const h = harness({ age: '', ageMonths: '', height: '158', weight: '46' });
    const archive = h.row(['12', '6', '156.2', '44.4']);
    const original = h.snapshot()[0]; h.update();
    h.elements.get('age').value = '13'; h.elements.get('ageMonths').value = '0';
    h.update(); h.update(); h.update();
    expect(h.rows).toHaveLength(2); expect(h.rows[1]).toBe(archive);
    expect(h.snapshot()[1]).toEqual(original);
    expect(h.rows.filter(row => row.dataset.locked === 'true')).toHaveLength(1);
    expect(SELECTORS.map(selector => h.rows[0].querySelector(selector).value)).toEqual(['13', '0', '158', '46']);
    h.elements.get('height').value = '159'; h.update();
    expect(h.rows[0].querySelector('.intake-ht').value).toBe('159');
    expect(h.snapshot()[1]).toEqual(original);
  });

  it('does not claim a distinct unlocked observation even if it has exactly the current metrics', () => {
    const h = harness({ age: '13', ageMonths: '4', height: '158', weight: '75' });
    const archive = h.row(), before = h.snapshot()[0]; h.update();
    expect(h.rows).toHaveLength(2); expect(h.rows[1]).toBe(archive); expect(h.snapshot()[1]).toEqual(before);
  });

  it('moves the known current row before archives without creating another measurement', () => {
    const h = harness({ age: '13', ageMonths: '4', height: '158', weight: '75' });
    const archive = h.row(['10', '0', '140', '32']), current = h.row(['13', '4', '158', '75'], { locked: 'true' });
    h.update(); h.update(); expect(h.rows).toEqual([current, archive]);
  });

  it('native autofill marks its actual current creation before the updater and does not invent a second current row', () => {
    const h = harness({ age: '13', ageMonths: '4', height: '158', weight: '75' });
    h.win.advancedGrowthData = { measurements: [{ ageMonths: 120, height: 141, weight: 33 }] };
    h.win.intakeAutofill(); h.update(); h.update();
    expect(h.rows).toHaveLength(2);
    expect(h.rows.filter(row => row.dataset.locked === 'true')).toHaveLength(1);
    expect(h.snapshot().map(row => row.inputs.map(input => input.value))).toEqual([
      ['13', '4', '158', '75'], ['10', '0', '141', '33'],
    ]);
    expect(h.rows[1].dataset.locked).toBeUndefined();
  });

  it('keeps the existing cleanup of an entirely empty locked placeholder', () => {
    const h = harness(); h.row(['', '', '', ''], { locked: 'true' });
    const archive = h.row(); h.update();
    expect(h.rows).toEqual([archive]);
    expect(archive.dataset).toEqual({ advIntakeSyncId: 'fictional-archive-id' });
  });
});
