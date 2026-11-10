import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { zrodlo } from '../support/silnik-bmi.mjs';

// Synthetic patient; only the canvas/PDF boundary is replaced. Both curve
// preparation and the Creator's annotation layout are production functions.
function environment() {
  const plots = [], texts = [], pdfs = [];
  const fields = Object.fromEntries(Object.entries({ age: '12', ageMonths: '0', sex: 'M', height: '130', weight: '35' })
    .map(([key, value]) => [key, { value }]));
  const ctx = new Proxy({ measureText: text => ({ width: String(text).length * 20 }),
    fillText: text => texts.push(text) }, { get: (obj, key) => key in obj ? obj[key] : () => {} });
  const document = { getElementById: key => fields[key] || null, addEventListener() {},
    querySelector: () => ({ value: 'OLAF' }), head: { appendChild() {} },
    createElement: kind => kind === 'canvas' ? { getContext: () => ctx, toDataURL: () => 'data:image/jpeg;base64,AA==' } : {} };
  const win = { document, advancedGrowthData: { measurements: [], currentAgeMonths: 144, currentHeight: 130, currentWeight: 35 },
    collectPageMeasurementsInRange: (_min, _max, input) => ({
      ptsH: input.adv.measurements.filter(point => Number.isFinite(point.height)),
      ptsW: input.adv.measurements.filter(point => Number.isFinite(point.weight)) }),
    drawCentileGrid: (_ctx, options) => plots.push(options), drawCentileMeasurementSeries: vi.fn(),
    getCentilePlotMetrics: (x, y, w, h) => ({ px: x + 100, py: y + 80, pw: w - 200, ph: h - 160 }),
    jspdf: { jsPDF: class { constructor(options) { pdfs.push(options); } addImage() {} output() { return {}; } } },
    URL: { createObjectURL: () => 'blob:fictional-zemel' }, open: vi.fn(), alert: vi.fn() };
  win.window = win; win.globalThis = win;
  const context = vm.createContext(win);
  for (const file of ['ds_lms.js', 'vilda_bmi.js', 'inline_index_03.js', 'inline_index_05.js', 'vilda_publication_creator.js']) {
    vm.runInContext(zrodlo(file), context, { filename: file });
  }
  return { win, plots, texts, pdfs, pc: win.VildaPublicationCreator };
}

describe('Kreator Zemel delegates clinical curves to the native DS producer', () => {
  it('retains the exact reproducible integration in both native PDF entry points and the Creator button', () => {
    expect(execFileSync(process.execPath, ['tools/apply_zemel_creator.mjs', '--check'], {
      cwd: new URL('../../', import.meta.url), encoding: 'utf8' })).toContain('3 exact artifact anchors verified');
  });
  it.each(['M', 'F'].flatMap(sex => [0, 35, 36, 240].map(age => [sex, age])))('%s/%i months: identical curve samples and native bounds', (sex, age) => {
    const e = environment();
    const args = { sex, userAgeMonths: age, userHeight: 130, userWeight: 35,
      growthData: { measurements: [{ ageMonths: age, height: 130, weight: 35 }] } };
    const before = JSON.stringify(args);
    const native = e.win.VildaDsCentileModels.build(args);
    const page = e.pc.buildDsPageCanvas(args);
    expect([page.width, page.height]).toEqual([2480, 3508]);
    expect(e.plots).toHaveLength(2);
    for (const [index, metric] of ['height', 'weight'].entries()) {
      expect(e.plots[index].curves).toEqual(native[metric].curves);
      expect([e.plots[index].minY, e.plots[index].maxY]).toEqual([native[metric].minY, native[metric].maxY]);
      expect([e.plots[index].minX, e.plots[index].maxX]).toEqual([0, 240]);
    }
    expect(JSON.stringify(args)).toBe(before);
    expect(e.win.chartCreatorData, 'plain export cannot create an annotation store').toBeUndefined();
  });

  it('draws the patient-owned annotations on the DS geometry without caching it as OLAF', () => {
    const e = environment();
    e.pc._setContext('olaf');
    e.pc._addFree('height', { ageMonths: 144, value: 130, txt: 'Fikcyjna kontrola', arrow: false });
    const before = JSON.stringify(e.win.chartCreatorData);
    e.pc.buildDsPageCanvas();
    expect(e.texts).toContain('Fikcyjna kon');
    expect(e.pc._geomStore.height).toMatchObject({ source: 'DS', ageMin: 0, ageMax: 240 });
    expect(e.pc._geomByContext.olaf, 'legacy OLAF pixels must retain their true source geometry').toBeUndefined();
    expect(JSON.stringify(e.win.chartCreatorData)).toBe(before);
  });

  it('fails closed without DS data or beyond its existing age domain', () => {
    const e = environment();
    expect(e.pc.buildDsPageCanvas({ sex: 'M', userAgeMonths: 241 })).toBeNull();
    e.win.VildaDsCentileModels = null;
    expect(e.pc.buildDsPageCanvas()).toBeNull();
    expect(e.plots).toHaveLength(0);
  });

  it('uses the same DS page for PDF and does not create patient data', async () => {
    const e = environment();
    await e.pc.generateDsChart();
    expect(e.pdfs).toEqual([{ orientation: 'portrait', unit: 'mm', format: 'a4' }]);
    expect(e.win.open).toHaveBeenCalledWith('blob:fictional-zemel', '_blank');
    expect(e.win.chartCreatorData).toBeUndefined();
  });

  it('does not export a previous patient after a delayed PDF dependency completes', async () => {
    const e = environment();
    let finish;
    e.win.vildaEnsurePdfLibraries = () => new Promise(resolve => { finish = resolve; });
    const pending = e.pc.generateDsChart();
    e.win.chartCreatorData = { otherPatient: true };
    finish(); await pending;
    expect(e.win.open).not.toHaveBeenCalled();
    expect(e.pdfs).toEqual([]);
  });

  it('reports an actual failed PDF dependency without exporting an incomplete page', async () => {
    const e = environment();
    e.win.vildaEnsurePdfLibraries = async () => { throw new Error('Fictional offline dependency failure'); };
    await e.pc.generateDsChart();
    expect(e.win.alert).toHaveBeenCalledWith('Nie udało się wczytać bibliotek PDF. Spróbuj ponownie.');
    expect(e.win.open).not.toHaveBeenCalled();
  });
});
