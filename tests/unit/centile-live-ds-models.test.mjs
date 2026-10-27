import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { zrodlo } from '../support/silnik-bmi.mjs';

// Exercise both actual page-specific legacy PDF callbacks and their read-only
// model export. Canvas/PDF delivery is the boundary; all clinical curves and
// their scale come from the production modules and the shared engine.
function setup(file, sex) {
  const handlers = [], draws = [];
  let generate;
  const fields = Object.fromEntries(Object.entries({ age: 12, ageMonths: 0, sex, height: 130, weight: 35 })
    .map(([id, value]) => [id, { value: String(value) }]));
  fields.generateDsCentileChart = { addEventListener(_type, callback) { generate = callback; } };
  const context2d = { fillRect() {}, save() {}, restore() {}, fillText() {} };
  const canvas = { getContext: () => context2d, toDataURL: () => 'data:image/jpeg;base64,AA==' };
  const document = { getElementById: id => fields[id] || null,
    addEventListener: (_name, callback) => handlers.push(callback),
    createElement: vi.fn(() => canvas) };
  const win = { document, drawCentileGrid: (_ctx, options) => draws.push(options),
    collectPageMeasurementsInRange: () => ({ ptsH: [{ ageMonths: 144, height: 130 }], ptsW: [{ ageMonths: 144, weight: 35 }] }),
    jspdf: { jsPDF: class { addImage() {} output() { return {}; } } }, open: vi.fn(),
    URL: { createObjectURL: () => 'blob:fictional-ds-parity' }, alert: vi.fn() };
  win.window = win; win.globalThis = win;
  const context = vm.createContext(win);
  for (const script of ['ds_lms.js', 'vilda_bmi.js', 'inline_index_03.js', file]) vm.runInContext(zrodlo(script), context, { filename: script });
  handlers.at(-1)();
  return { win, document, draws, generate: () => generate() };
}

describe('read-only Zemel models reuse the existing native DS PDF curves', () => {
  it.each(['inline_index_05.js', 'inline_docpro_03.js'].flatMap(file => ['M', 'F'].map(sex => [file, sex])))('%s/%s keeps every native curve sample and scale without drawing in model mode', async (file, sex) => {
    const e = setup(file, sex);
    const args = { sex, userAgeMonths: 144, userHeight: 130, userWeight: 35,
      growthData: { measurements: [{ ageMonths: 144, height: 130, weight: 35 }] } };
    const before = JSON.stringify(args);
    const model = e.win.VildaDsCentileModels.build(args);
    expect(model.source).toBe('DS');
    expect(e.document.createElement).not.toHaveBeenCalled();
    expect(e.draws).toEqual([]);
    await e.generate();
    expect(e.draws).toHaveLength(2);
    for (const [index, metric] of ['height', 'weight'].entries()) {
      const actual = model[metric], legacy = e.draws[index];
      expect(actual.curves).toEqual(legacy.curves);
      expect(actual.minY).toBe(legacy.minY);
      expect(actual.maxY).toBe(legacy.maxY);
      expect(actual.officialMaxY).toBe(legacy.maxY);
      expect(actual.minX).toBe(0);
      expect(actual.maxX).toBe(240);
      expect(actual.percentiles).toEqual([3, 10, 25, 50, 75, 90, 97]);
      for (const values of Object.values(actual.curves)) expect(values).toHaveLength(241);
    }
    expect(JSON.stringify(args)).toBe(before);
  });

  it('expands only presentation bounds for recorded outliers, retaining all reference curves', () => {
    const e = setup('inline_index_05.js', 'F');
    e.win.collectPageMeasurementsInRange = () => ({ ptsH: [{ ageMonths: 144, height: 210 }], ptsW: [{ ageMonths: 144, weight: 250 }] });
    const result = e.win.VildaDsCentileModels.build({ sex: 'F', userAgeMonths: 144, userHeight: 210, userWeight: 250 });
    for (const metric of ['height', 'weight']) expect(result[metric].maxY).toBeGreaterThan(result[metric].officialMaxY);
    expect(result.height.maxY).toBe(210);
    expect(result.weight.maxY).toBe(250);
    expect(result.height.curves[50][144]).toBe(e.win.VildaDsLMS.DZIECKO.HT.F[144][1]);
  });

  it('fails closed without the shared clinical engine or outside the native DS age range', () => {
    const e = setup('inline_index_05.js', 'M');
    expect(e.win.VildaDsCentileModels.build({ sex: 'M', userAgeMonths: 241 })).toBeNull();
    expect(e.win.VildaDsCentileModels.build({ sex: 'M', userAgeMonths: -1 })).toBeNull();
    e.win.VildaBmi = null;
    expect(e.win.VildaDsCentileModels.build({ sex: 'M', userAgeMonths: 144 })).toBeNull();
    expect(e.document.createElement).not.toHaveBeenCalled();
  });
});
