import { describe, expect, it } from 'vitest';
import { zrodlo } from '../support/silnik-bmi.mjs';

function harness() {
  class Element extends EventTarget {
    constructor(id = '') { super(); this.id = id; this.value = ''; this.style = {}; this.dataset = {}; this.children = []; this.fields = new Map(); this.classList = { add() {}, remove() {}, toggle() {} }; }
    appendChild(node) { node.parent = this; this.children.push(node); return node; }
    remove() {
      if (!this.parent) return;
      const index = this.parent.children.indexOf(this);
      if (index >= 0) this.parent.children.splice(index, 1);
      this.parent = null;
    }
    click() { this.dispatchEvent(new Event('click')); }
    set innerHTML(html) {
      this.fields.clear();
      for (const match of String(html).matchAll(/<(input|button)\b[^>]*class="([^"]+)"[^>]*>/gu)) {
        const field = new Element(); field.type = match[1] === 'input' ? 'number' : 'button';
        for (const name of match[2].split(' ')) this.fields.set('.' + name, field);
      }
    }
    set textContent(value) { if (value === '') { this.children.length = 0; this.fields.clear(); } }
    querySelector(selector) { return this.fields.get(selector) || null; }
    querySelectorAll(selector) {
      if (selector === 'input') return [...new Set(this.fields.values())].filter(field => field.type === 'number');
      return this.children.filter(child => child.className === 'measure-row');
    }
    getAttribute() { return null; }
    setAttribute() {}
    removeAttribute() {}
  }
  const elements = new Map();
  for (const [id, value] of Object.entries({ age: '13', ageMonths: '0', height: '158', weight: '46', sex: 'M', name: 'Fikcyjny test', basicGrowthName: 'Fikcyjny test' })) {
    const element = new Element(id); element.value = value; elements.set(id, element);
  }
  const container = new Element('basicGrowthMeasurements'); elements.set(container.id, container);
  const document = {
    readyState: 'loading', addEventListener() {}, getElementById: id => elements.get(id) || null,
    createElement: () => new Element(), querySelector: () => null,
    querySelectorAll(selector) {
      if (selector === '#basicGrowthMeasurements .measure-row') return container.children;
      if (selector.startsWith('#basicGrowthMeasurements .bg-')) return container.children.map(row => row.querySelector(selector.slice('#basicGrowthMeasurements '.length))).filter(Boolean);
      return [];
    },
  };
  const win = { document, vildaOnReady() {},
    VildaHtml: { setTrustedHtml(element, html) { element.innerHTML = html; return true; }, clearHtml(element) { element.textContent = ''; return true; } },
  };
  win.window = win; win.globalThis = win;
  new Function('window', 'document', 'globalThis', zrodlo('growth-basic-module.js'))(win, document, win);
  const rows = () => container.children.map(row => ({ ageYears: Number(row.querySelector('.bg-age-years').value),
    ageMonthsPart: Number(row.querySelector('.bg-age-months').value), height: row.querySelector('.bg-height').value, weight: row.querySelector('.bg-weight').value }));
  return { win, container, rows };
}
const ACCEPTED = { measurements: [{ ageMonths: 102, ageYears: 8.5, height: 131.7, weight: 29.1 }] };
const STALE = { measurements: [{ ageMonths: 96, ageYears: 8, height: 128, weight: 27 }] };
const IDENTIFIED = { measurements: [
  { ageMonths: 102, ageYears: 8.5, height: 131.7, weight: 29.1,
    uid: 'fictional-observation-a', dateISO: '2025-01-12', boneAgeYears: 7.5 },
  { ageMonths: 102, ageYears: 8.5, height: 131.9, weight: 29.3,
    uid: 'fictional-observation-b', dateISO: '2025-01-28', boneAgeYears: 8.25 },
] };

function edit(row, selector, value, eventType = 'input') {
  const input = row.querySelector(selector);
  expect(input).not.toBeNull();
  input.value = value;
  input.dispatchEvent(new Event(eventType));
}

describe('basic history hydrates from the accepted source before ordinary calculation', () => {
  it('uses explicit accepted data despite an intervening calculation replacing the ambient model', () => {
    const h = harness(), source = structuredClone(ACCEPTED), before = structuredClone(source);
    h.win.basicGrowthData = { measurements: [] };
    h.win.vildaRehydrateBasicGrowthFromState({ data: source });
    expect(h.rows()).toEqual([{ ageYears: 8, ageMonthsPart: 6, height: '131.7', weight: '29.1' }]);
    expect(h.win.basicGrowthData.measurements).toEqual(ACCEPTED.measurements);
    expect(source).toEqual(before);
    expect(h.win.basicGrowthData).not.toBe(source);
  });

  it('also commits the accepted model and table when synchronous calculation is intentionally deferred', () => {
    const h = harness(); h.win.basicGrowthData = structuredClone(STALE);
    h.win.vildaRehydrateBasicGrowthFromState({ data: ACCEPTED, skipRecalc: true });
    expect(h.win.basicGrowthData).toEqual(ACCEPTED);
    expect(h.rows()[0].height).toBe('131.7');
    h.win.calculateBasicGrowth();
    expect(h.win.basicGrowthData.measurements).toEqual(ACCEPTED.measurements);
  });

  it.each([null, [], { measurements: [] }])('explicit %j keeps an owned empty history empty', data => {
    const h = harness(); h.win.basicGrowthData = structuredClone(STALE);
    h.win.vildaRehydrateBasicGrowthFromState({ data });
    expect(h.win.basicGrowthData.measurements).toEqual([]);
    expect(h.container.children).toHaveLength(1);
    expect(h.container.children[0].querySelector('.bg-height').value).toBe('');
    h.win.calculateBasicGrowth();
    expect(h.win.basicGrowthData.measurements).toEqual([]);
  });

  it('retains the legacy ambient source only when the data option is absent', () => {
    const h = harness(); h.win.basicGrowthData = structuredClone(STALE);
    h.win.vildaRehydrateBasicGrowthFromState();
    expect(h.win.basicGrowthData.measurements).toEqual(STALE.measurements);
  });

  it('reads genuine later edits from the actual row instead of replaying the accepted source', () => {
    const h = harness(), source = structuredClone(ACCEPTED);
    h.win.vildaRehydrateBasicGrowthFromState({ data: source });
    const height = h.container.children[0].querySelector('.bg-height');
    height.value = '132.2'; height.dispatchEvent(new Event('input'));
    expect(h.win.basicGrowthData.measurements[0].height).toBe(132.2);
    expect(source.measurements[0].height).toBe(131.7);
  });

  it('preserves two distinct observations at the same age', () => {
    const h = harness(), source = { measurements: [...ACCEPTED.measurements,
      { ageMonths: 102, ageYears: 8.5, height: 131.9, weight: 29.3 }] };
    h.win.vildaRehydrateBasicGrowthFromState({ data: source });
    expect(h.win.basicGrowthData.measurements).toEqual(source.measurements);
    expect(h.container.children).toHaveLength(2);
  });

  it('preserves supported native metadata through accepted hydration and ordinary calculation', () => {
    const h = harness(), source = structuredClone(IDENTIFIED), before = structuredClone(source);
    source.measurements[0].derivedSds = -1.2;
    source.measurements[0].plot = { x: 102, y: 131.7 };
    source.measurements[0].growthVelocity = 4.1;
    const supplied = structuredClone(source);
    h.win.vildaRehydrateBasicGrowthFromState({ data: source });
    expect(h.win.basicGrowthData.measurements).toEqual(before.measurements);
    h.win.calculateBasicGrowth();
    expect(h.win.basicGrowthData.measurements).toEqual(before.measurements);
    expect(source).toEqual(supplied);
    expect(h.win.basicGrowthData.measurements[0]).not.toBe(source.measurements[0]);
  });

  it('keeps metadata when accepted hydration defers calculation', () => {
    const h = harness(), source = structuredClone(IDENTIFIED);
    h.win.vildaRehydrateBasicGrowthFromState({ data: source, skipRecalc: true });
    expect(h.win.basicGrowthData.measurements).toEqual(source.measurements);
    expect(h.container.children).toHaveLength(2);
    h.win.calculateBasicGrowth();
    expect(h.win.basicGrowthData.measurements).toEqual(source.measurements);
  });

  it('keeps metadata on its actual row after a height edit and an age edit reversing sorted order', () => {
    const h = harness(), source = structuredClone(IDENTIFIED);
    h.win.vildaRehydrateBasicGrowthFromState({ data: source, skipRecalc: true });
    const [firstRow, secondRow] = h.container.children;
    edit(secondRow, '.bg-height', '132.4');
    expect(h.win.basicGrowthData.measurements).toEqual([
      source.measurements[0], { ...source.measurements[1], height: 132.4 },
    ]);
    edit(firstRow, '.bg-age-years', '9', 'change');
    expect(h.container.children[0]).toBe(firstRow);
    expect(h.container.children[1]).toBe(secondRow);
    expect(h.win.basicGrowthData.measurements).toEqual([
      { ...source.measurements[1], height: 132.4 },
      { ...source.measurements[0], ageMonths: 114, ageYears: 9.5 },
    ]);
    expect(source).toEqual(IDENTIFIED);
  });

  it('removes only the clicked native row and preserves the other equal-age observation identity', () => {
    const h = harness(), source = structuredClone(IDENTIFIED);
    h.win.vildaRehydrateBasicGrowthFromState({ data: source });
    const [firstRow, secondRow] = h.container.children;
    edit(firstRow, '.bg-age-years', '9');
    const remove = firstRow.querySelector('.remove-measure');
    expect(remove).not.toBeNull();
    expect(remove.style.display).toBe('inline-block');
    remove.click();
    expect(h.container.children).toHaveLength(1);
    expect(h.container.children[0]).toBe(secondRow);
    expect(h.win.basicGrowthData.measurements).toEqual([source.measurements[1]]);
    expect(secondRow.querySelector('.remove-measure').style.display).toBe('none');
    expect(source).toEqual(IDENTIFIED);
  });

  it('gives a newly added blank row no metadata even when filled with the same age and values', () => {
    const h = harness();
    h.win.vildaRehydrateBasicGrowthFromState({ data: structuredClone(IDENTIFIED) });
    h.win.addBasicGrowthMeasurementRow();
    expect(h.container.children).toHaveLength(3);
    expect(h.win.basicGrowthData.measurements).toEqual(IDENTIFIED.measurements);
    const added = h.container.children[2];
    expect(added.querySelector('.bg-age-years').value).toBe('');
    edit(added, '.bg-age-years', '8');
    edit(added, '.bg-age-months', '6', 'change');
    edit(added, '.bg-height', '131.7');
    edit(added, '.bg-weight', '29.1', 'change');
    expect(h.win.basicGrowthData.measurements).toEqual([
      ...IDENTIFIED.measurements, { ...ACCEPTED.measurements[0] },
    ]);
  });

  it.each([0, -1, NaN, Infinity, -Infinity, '8', null, undefined])(
    'does not carry unsupported metadata or boneAgeYears=%s into the calculated history', boneAgeYears => {
      const h = harness(), observation = { ...ACCEPTED.measurements[0],
        uid: 42, dateISO: { value: '2025-01-12' }, boneAgeYears, derivedSds: -1.2 };
      h.win.vildaRehydrateBasicGrowthFromState({ data: { measurements: [observation] } });
      expect(h.win.basicGrowthData.measurements).toEqual(ACCEPTED.measurements);
    },
  );

  it('omits empty metadata strings while retaining a positive fractional bone age', () => {
    const h = harness();
    h.win.vildaRehydrateBasicGrowthFromState({ data: { measurements: [
      { ...ACCEPTED.measurements[0], uid: '', dateISO: '', boneAgeYears: 0.25 },
    ] } });
    expect(h.win.basicGrowthData.measurements).toEqual([
      { ...ACCEPTED.measurements[0], boneAgeYears: 0.25 },
    ]);
  });
});
