import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

function load(win = {}, files = ['vilda_html.js']) {
  const context = vm.createContext({ ...win, window: win, globalThis: win, document: win.document });
  for (const file of files) vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  return win;
}

describe('Explicit synchronous result restoration batch', () => {
  it('keeps the deployment extension reproducible at every unique artifact anchor', () => {
    const output = execFileSync(process.execPath, ['tools/apply_restore_result_batching.mjs', '--check'], { encoding: 'utf8' });
    expect(output).toContain('18 exact anchors in 6 artifacts');
  });
  it('keeps ordinary rendering immediate and preserves return values', () => {
    const html = load().VildaHtml;
    let result = 'before';
    expect(html.refreshResult('a', () => { result = 'after'; return 17; })).toBe(17);
    expect(result).toBe('after');
    expect(html.withResultRefreshBatch(() => 'restore result')).toBe('restore result');
  });

  it('publishes only the last requested view for each card before restore returns', () => {
    const html = load().VildaHtml, calls = [];
    const result = html.withResultRefreshBatch(() => {
      for (let i = 0; i < 20; i++) html.refreshResult('advanced', () => calls.push(`advanced ${i}`));
      html.refreshResult('basic', () => calls.push('basic'));
      expect(calls).toEqual([]);
      return 'restored';
    });
    expect(result).toBe('restored');
    expect(calls).toEqual(['advanced 19', 'basic']);
  });

  it('nested restore flushes only at the outer boundary', () => {
    const html = load().VildaHtml, calls = [];
    html.withResultRefreshBatch(() => {
      html.refreshResult('advanced', () => calls.push('outer old'));
      html.withResultRefreshBatch(() => html.refreshResult('advanced', () => calls.push('inner')));
      expect(calls).toEqual([]);
      html.refreshResult('advanced', () => calls.push('outer final'));
    });
    expect(calls).toEqual(['outer final']);
  });

  it.each([['valid', 'clear'], ['clear', 'valid']])('last view wins for %s → %s', (first, last) => {
    const html = load().VildaHtml, calls = [];
    html.withResultRefreshBatch(() => {
      html.refreshResult('result', () => calls.push(first));
      html.refreshResult('result', () => calls.push(last));
    });
    expect(calls).toEqual([last]);
  });

  it('flushes completed work and releases the batch after the restoration throws', () => {
    const html = load().VildaHtml, calls = [], error = new Error('synthetic restore failure');
    expect(() => html.withResultRefreshBatch(() => {
      html.refreshResult('result', () => calls.push('queued'));
      throw error;
    })).toThrow(error);
    html.refreshResult('result', () => calls.push('ordinary'));
    expect(calls).toEqual(['queued', 'ordinary']);
  });

  it('finishes independent cards on a renderer error and keeps the original restore error', () => {
    const html = load().VildaHtml, calls = [];
    const original = new Error('original restore failure');
    expect(() => html.withResultRefreshBatch(() => {
      html.refreshResult('first', () => { throw new Error('renderer failure'); });
      html.refreshResult('second', () => calls.push('second'));
      throw original;
    })).toThrow(original);
    html.refreshResult('third', () => calls.push('third'));
    expect(calls).toEqual(['second', 'third']);
  });

  it('propagates a renderer failure after finishing the remaining cards', () => {
    const html = load().VildaHtml, calls = [], error = new Error('renderer failure');
    expect(() => html.withResultRefreshBatch(() => {
      html.refreshResult('first', () => { throw error; });
      html.refreshResult('second', () => calls.push('second'));
    })).toThrow(error);
    expect(calls).toEqual(['second']);
    expect(html.refreshResult('first', () => 9)).toBe(9);
  });

  it('replaces a pending card when another renderer requests its newer view during flush', () => {
    const html = load().VildaHtml, calls = [];
    html.withResultRefreshBatch(() => {
      html.refreshResult('first', () => {
        calls.push('first');
        html.withResultRefreshBatch(() => html.refreshResult('second', () => calls.push('second latest')));
        html.refreshResult('third', () => calls.push('third'));
      });
      html.refreshResult('second', () => calls.push('second obsolete'));
    });
    expect(calls).toEqual(['first', 'second latest', 'third']);
  });

  it('does not render a container detached by a later synchronous restore', () => {
    const html = load().VildaHtml, calls = [], removed = { isConnected: true };
    html.withResultRefreshBatch(() => {
      html.refreshResult('result', () => calls.push('removed'), removed);
      removed.isConnected = false;
    });
    expect(calls).toEqual([]);
    html.withResultRefreshBatch(() => {
      html.refreshResult('result', () => calls.push('removed'), removed);
      html.refreshResult('result', () => calls.push('replacement'), { isConnected: true });
    });
    expect(calls).toEqual(['replacement']);
  });

  it('does not change trusted HTML, escaping, aliases or ordinary clear contracts', () => {
    const win = load(), html = win.VildaHtml, node = {};
    expect(win.vildaHtml).toBe(html);
    expect(html.escapeHtml('<synthetic>')).toBe('&lt;synthetic&gt;');
    expect(html.setTrustedHtml(node, '<p>synthetic</p>')).toBe(true);
    expect(node.innerHTML).toBe('<p>synthetic</p>');
    expect(html.clear(node)).toBe(true);
    expect(node.textContent).toBe('');
    expect(win.vildaSetTrustedHtml).toBe(html.setTrustedHtml);
  });
});

function growthFixture() {
  const elements = new Map(), writes = [];
  function element(id, value = '') {
    let markup = '';
    const node = {
      id, value, style: {}, dataset: {}, isConnected: true,
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      querySelector() { return null; }, querySelectorAll() { return []; },
      getAttribute() { return null; }, setAttribute() {}, removeAttribute() {}, addEventListener() {},
      get innerHTML() { return markup; },
      set innerHTML(value) { markup = value; writes.push([id, 'write', value]); },
      get textContent() { return markup; },
      set textContent(value) { markup = value; writes.push([id, 'clear', value]); },
    };
    elements.set(id, node);
    return node;
  }
  const doc = {
    readyState: 'loading', addEventListener() {}, querySelector() { return null; },
    querySelectorAll() { return []; }, getElementById(id) { return elements.get(id) || null; },
  };
  for (const [id, value] of Object.entries({ age: '13', ageMonths: '0', height: '159', weight: '47', sex: 'M', name: 'FIKCYJNY TEST' })) element(id, value);
  element('advResults'); element('basicGrowthResults');
  const win = { document: doc, vildaOnReady() {}, getAgeDecimal() { return Number(elements.get('age').value); } };
  load(win, ['vilda_html.js', 'vilda_advanced_growth.js', 'growth-basic-module.js']);
  return { win, elements, writes };
}

describe('Production growth modules retain synchronous models and last result presentation', () => {
  for (const kind of ['basic', 'advanced']) {
    function calculate(fixture) {
      if (kind === 'basic') fixture.win.calculateBasicGrowth();
      else fixture.win.VildaAdvancedGrowth.calculateGrowthAdvanced({ document: fixture.win.document, getAgeDecimal: fixture.win.getAgeDecimal });
    }
    const resultId = kind === 'basic' ? 'basicGrowthResults' : 'advResults';
    const dataKey = kind === 'basic' ? 'basicGrowthData' : 'advancedGrowthData';
    it(`${kind}: every model update remains visible during the batch, result renders once`, () => {
      const fixture = growthFixture();
      fixture.win.VildaHtml.withResultRefreshBatch(() => {
        calculate(fixture);
        expect(fixture.win[dataKey]).not.toBeNull();
        fixture.elements.get('height').value = '160';
        calculate(fixture);
        expect(fixture.win[dataKey].currentHeight).toBe(160);
        expect(fixture.writes.filter(([id]) => id === resultId)).toEqual([]);
      });
      expect(fixture.writes.filter(([id]) => id === resultId)).toHaveLength(1);
      expect(fixture.elements.get(resultId).innerHTML).not.toBe('');
    });
    it.each([false, true])(`${kind}: valid/invalid transition clearFirst=%s`, clearFirst => {
      const fixture = growthFixture();
      fixture.win.VildaHtml.withResultRefreshBatch(() => {
        fixture.elements.get('age').value = clearFirst ? '19' : '13';
        calculate(fixture);
        fixture.elements.get('age').value = clearFirst ? '13' : '19';
        calculate(fixture);
      });
      expect(fixture.writes.filter(([id]) => id === resultId)).toHaveLength(1);
      if (clearFirst) {
        expect(fixture.win[dataKey]).not.toBeNull();
        expect(fixture.elements.get(resultId).innerHTML).not.toBe('');
      } else {
        expect(fixture.win[dataKey]).toBeNull();
        expect(fixture.elements.get(resultId).innerHTML).toBe('');
      }
    });
  }
});
