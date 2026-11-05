import fs from 'node:fs';
import vm from 'node:vm';
import { parse } from 'espree';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(new URL('../../vilda_patient_report.js', import.meta.url), 'utf8');
const ast = parse(source, { ecmaVersion: 'latest' });
const names = ['updateProfessionalSummaryCard', 'renderProfessionalSummaryCardImmediately'];
const declarations = names.map(name => {
  const found = ast.body.filter(node => node.type === 'FunctionDeclaration' && node.id.name === name);
  if (found.length !== 1) throw new Error('Missing production function: ' + name);
  return source.slice(found[0].start, found[0].end);
}).join('\n');
const htmlSource = fs.readFileSync(new URL('../../vilda_html.js', import.meta.url), 'utf8');
const setters = source.slice(ast.body[0].start, ast.body[0].end);

function setup({ legacy = false } = {}) {
  const renders = [], events = [];
  const card = { style: {}, dataset: {}, isConnected: true };
  const wrap = { style: {} }, content = { classList: { remove() {} } };
  const elements = { currentSummaryCard: card, currentSummaryWrap: wrap, currentSummaryContent: content };
  const win = {
    console, document: {
      getElementById: id => elements[id] || null,
      querySelector: () => null,
      dispatchEvent: event => { events.push({ ...event.detail, model: win.advancedGrowthData?.marker }); },
    },
    CustomEvent: function (type, options) { this.type = type; this.detail = options.detail; },
    location: { pathname: '/index.html' }, professionalMode: true,
    getAgeDecimal: () => 12,
    getFormattedProfessionalSummaryLines: () => [`Wzrost: ${win.advancedGrowthData?.marker || 'initial'}`],
    getProfessionalSummaryLineTone: () => 'normal',
    Bd1() {}, attachPatientReportActionToSummaryCard() {}, vildaAppClearHtml() {},
    VildaProfessionalSummary: { render(node, lines) { renders.push({ node, lines: [...lines] }); } },
    vildaAppOnReady(id, callback) { callback(); },
  };
  win.window = win;
  vm.createContext(win);
  if (!legacy) vm.runInContext(htmlSource, win);
  vm.runInContext(declarations + '\n' + setters, win);
  return { win, renders, events, card };
}

describe('Public professional summary presents the completed synchronous restoration', () => {
  it('keeps setters synchronous but renders and publishes only the final model', () => {
    const { win, renders, events } = setup();
    win.VildaHtml.withResultRefreshBatch(() => {
      for (let i = 0; i < 142; i++) {
        win.advancedGrowthData = { marker: `FIKCYJNY-${i}` };
        expect(win.advancedGrowthData.marker).toBe(`FIKCYJNY-${i}`);
      }
      win.updateProfessionalSummaryCard();
      expect(renders).toHaveLength(0);
      expect(events).toHaveLength(0);
    });
    expect(renders.map(row => row.lines)).toEqual([['Wzrost: FIKCYJNY-141']]);
    expect(events).toEqual([{ available: true, comparisonVisible: false, isChild: true, model: 'FIKCYJNY-141' }]);
  });

  it('ordinary edits and a legacy host still render before returning', () => {
    for (const legacy of [false, true]) {
      const { win, renders, events } = setup({ legacy });
      win.advancedGrowthData = { marker: 'FIKCYJNY-pierwszy' };
      expect(renders.at(-1).lines).toEqual(['Wzrost: FIKCYJNY-pierwszy']);
      expect(events).toHaveLength(1);
      win.advancedGrowthData = { marker: 'FIKCYJNY-drugi' };
      expect(renders.at(-1).lines).toEqual(['Wzrost: FIKCYJNY-drugi']);
      expect(events).toHaveLength(2);
    }
  });

  it('nested restoration and an exception flush the last complete state without leaking a pending update', () => {
    const { win, renders, events } = setup();
    expect(() => win.VildaHtml.withResultRefreshBatch(() => {
      win.advancedGrowthData = { marker: 'FIKCYJNY-old' };
      win.VildaHtml.withResultRefreshBatch(() => { win.advancedGrowthData = { marker: 'FIKCYJNY-final' }; });
      expect(renders).toHaveLength(0);
      throw new Error('synthetic restore failure');
    })).toThrow('synthetic restore failure');
    expect(renders.map(row => row.lines)).toEqual([['Wzrost: FIKCYJNY-final']]);
    expect(events).toHaveLength(1);
    win.advancedGrowthData = { marker: 'FIKCYJNY-edit' };
    expect(renders.at(-1).lines).toEqual(['Wzrost: FIKCYJNY-edit']);
    expect(events).toHaveLength(2);
  });

  it.each([false, true])('the final patient state wins across clear transitions (clearFirst=%s)', clearFirst => {
    const { win, renders, events, card } = setup();
    win.getFormattedProfessionalSummaryLines = () => win.advancedGrowthData
      ? [`Wzrost: ${win.advancedGrowthData.marker}`] : [];
    win.VildaHtml.withResultRefreshBatch(() => {
      win.advancedGrowthData = clearFirst ? null : { marker: 'FIKCYJNY-before-clear' };
      win.advancedGrowthData = clearFirst ? { marker: 'FIKCYJNY-after-clear' } : null;
    });
    expect(events).toHaveLength(1);
    expect(events[0].available).toBe(clearFirst);
    if (clearFirst) expect(renders.map(row => row.lines)).toEqual([['Wzrost: FIKCYJNY-after-clear']]);
    else {
      expect(renders).toHaveLength(0);
      expect(card.style.display).toBe('none');
    }
  });

  it('does not publish a queued summary for a result surface removed during restoration', () => {
    const { win, renders, events, card } = setup();
    win.VildaHtml.withResultRefreshBatch(() => {
      win.advancedGrowthData = { marker: 'FIKCYJNY-old-patient' };
      card.isConnected = false;
    });
    expect(renders).toHaveLength(0);
    expect(events).toHaveLength(0);
  });
});
