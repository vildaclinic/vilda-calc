import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';

function environment() {
  const document = atrapaDokumentu();
  const create = document.createElement.bind(document);
  document.createElement = tag => { const element = create(tag); element.style = {}; element.dataset = {}; element.value = ''; return element; };
  document.querySelectorAll = selector => document.documentElement.querySelectorAll(selector);
  document.querySelector = selector => document.documentElement.querySelector(selector);
  for (const id of ['sgaBirthButtonWrapper', 'toggleSgaBirth', 'sgaBirthCard', 'computeSgaBirth', 'resetSgaBirth', 'sgaBirthMessage', 'sgaBirthResults',
    'sgaBirthWeeks', 'sgaBirthDays', 'sgaBirthWeight', 'sgaBirthLength', 'sgaBirthHead']) {
    const element = document.createElement(id.startsWith('sgaBirth') && ['Weeks', 'Days', 'Weight', 'Length', 'Head'].some(key => id.endsWith(key)) ? 'input' : 'div');
    element.id = id; document.body.appendChild(element);
  }
  const sources = ['niklasson', 'intergrowth', 'malewski'].map(value => {
    const input = document.createElement('input'); input.setAttribute('name', 'sgaBirthSource'); input.type = 'checkbox'; input.value = value; document.body.appendChild(input); return input;
  });
  const sex = document.createElement('input'); sex.setAttribute('name', 'sgaBirthSex'); sex.type = 'radio'; sex.value = 'male'; document.body.appendChild(sex);
  const writes = vi.fn(), events = vi.fn(), timers = vi.fn(() => 0);
  const window = { document, addEventListener: events, sessionStorage: { getItem: () => null, setItem: writes, removeItem: writes },
    vildaOnReady: (_key, fn) => fn(), getComputedStyle: () => ({ display: 'block' }) };
  const context = vm.createContext({ window, document, setTimeout: timers, clearTimeout() {} });
  vm.runInContext(readFileSync(new URL('../../sga_birth_module.js', import.meta.url), 'utf8'), context);
  sources.forEach(input => { input.checked = false; }); sex.checked = true;
  for (const [id, value] of Object.entries({ sgaBirthWeeks: '34', sgaBirthDays: '2', sgaBirthWeight: '1650', sgaBirthLength: '41', sgaBirthHead: '30' })) document.getElementById(id).value = value;
  writes.mockClear(); events.mockClear(); timers.mockClear();
  return { window, document, sources, writes, events, timers, api: window.vildaSgaBirthPersistApi };
}

describe('SGA capture shares its existing serialization without selecting a source on read', () => {
  it('matches actual capture output with no selected source while preserving every unchecked DOM control', () => {
    const readonly = environment(), ordinary = environment();
    const before = readonly.sources.map(input => input.checked), nodes = readonly.document.body.children.length;
    const output = readonly.api.captureStateReadOnly();
    expect(output).toEqual(ordinary.api.captureState());
    expect(output).toMatchObject({ sourceChoice: 'niklasson', sourceKeys: ['niklasson'], sex: 'male', weeks: '34', days: '2', weight: '1650' });
    expect(readonly.sources.map(input => input.checked)).toEqual(before); expect(ordinary.sources[0].checked).toBe(true);
    expect(readonly.document.body.children).toHaveLength(nodes); expect(readonly.writes).not.toHaveBeenCalled(); expect(readonly.events).not.toHaveBeenCalled(); expect(readonly.timers).not.toHaveBeenCalled();
    output.sourceKeys.push('detached'); expect(readonly.api.captureStateReadOnly().sourceKeys).toEqual(['niklasson']);
  });

  it('retains an explicitly selected comparison without normalizing it in DOM', () => {
    const h = environment(); h.sources[0].checked = true; h.sources[1].checked = true;
    expect(h.api.captureStateReadOnly()).toMatchObject({ sourceChoice: 'compare', sourceKeys: ['niklasson', 'intergrowth'] });
    expect(h.sources.map(input => input.checked)).toEqual([true, true, false]); expect(h.writes).not.toHaveBeenCalled();
  });
});
