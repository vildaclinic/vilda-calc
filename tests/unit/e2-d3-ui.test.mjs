import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const engine = require('../../vilda_e2_d3.js');
const data = JSON.parse(readFileSync(new URL('../../docs/clinical/hormone-lifespan/e2-d3-data.json', import.meta.url), 'utf8'));
const source = readFileSync(new URL('../../vilda_e2_d3_ui.js', import.meta.url), 'utf8');

// A small generic DOM executes the production mount and its event handlers.
// It supplies no source values, eligibility policy or rendering decisions.
function documentDouble() {
  const doc = { activeElement: null, createElement: tag => new Element(tag),
    createElementNS: (_ns, tag) => new Element(tag),
    createTextNode: text => { const node = new Element('#text'); node.textContent = text; return node; } };
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.children = [];
      this.attributes = {}; this.listeners = {}; this._text = ''; this.hidden = false;
      this.open = false; this.value = ''; this.clientWidth = 640;
    }
    get firstElementChild() { return this.children.find(child => child.tagName !== '#TEXT') || null; }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    set textContent(text) { this.replaceChildren(); this._text = String(text); }
    appendChild(child) {
      if (child.parentNode) child.parentNode.children = child.parentNode.children.filter(node => node !== child);
      this.children.push(child); child.parentNode = this; return child;
    }
    append(...children) { for (const child of children) this.appendChild(child); }
    replaceChildren(...children) {
      for (const child of this.children) child.parentNode = null;
      this.children = []; this._text = ''; this.append(...children);
    }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    getAttribute(key) { return this.attributes[key] ?? null; }
    removeAttribute(key) { delete this.attributes[key]; }
    addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
    dispatchEvent(event) { for (const listener of this.listeners[event.type] || []) listener(event); }
    focus() { doc.activeElement = this; }
    set innerHTML(html) {
      this.replaceChildren(); const stack = [this];
      for (const token of String(html).match(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g) || []) {
        if (token.startsWith('<!--')) continue;
        if (token.startsWith('</')) { stack.pop(); continue; }
        if (token.startsWith('<')) {
          const tag = token.match(/^<([\w-]+)/)?.[1];
          if (!tag) continue;
          const node = doc.createElement(tag);
          for (const match of token.slice(tag.length + 1).matchAll(/([\w-]+)(?:="([^"]*)"|='([^']*)')?/g)) {
            node.setAttribute(match[1], match[2] ?? match[3] ?? '');
          }
          stack.at(-1).appendChild(node);
          if (!/\/$/.test(token.slice(0, -1)) && !['br', 'hr', 'input', 'img'].includes(tag)) stack.push(node);
        } else stack.at(-1).appendChild(doc.createTextNode(token));
      }
    }
    querySelectorAll(selector) {
      const matches = node => {
        const attribute = selector.match(/^\[([^=\]]+)(?:=['"]?([^'"\]]+)['"]?)?\]$/);
        if (attribute) return attribute[2] === undefined
          ? node.getAttribute(attribute[1]) !== null : node.getAttribute(attribute[1]) === attribute[2];
        if (selector.startsWith('.')) return String(node.getAttribute('class') || '').split(/\s+/).includes(selector.slice(1));
        return node.tagName === selector.toUpperCase();
      };
      return this.children.flatMap(child => [...(matches(child) ? [child] : []), ...child.querySelectorAll(selector)]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  }
  doc.body = doc.createElement('body');
  return doc;
}

function context(extra = {}) {
  return { sourceStatus: 'ready', identityKey: 'fictional-d3-a', measurementKey: 'fictional-measurement-a',
    analyte: 'estradiol', sex: 'female', ageYears: 30, ageUpperYears: 31, ageUpperInclusive: false,
    ageLabel: '30 lat', contextBasis: 'current-patient', cyclePhase: 'follicular',
    measurement: { status: 'valid', value: 65.4, unit: 'pg/mL', operator: '=', isExact: true }, ...extra };
}
function mount(extra = {}) {
  const document = documentDouble(), host = document.createElement('div'), onActivity = vi.fn();
  document.body.appendChild(host);
  const window = { innerWidth: 1440, addEventListener: vi.fn() };
  vm.runInNewContext(source, { window, Intl, Object, Number, JSON });
  const controller = window.VildaE2D3UI.mount({ host, data, engine, onActivity, ...extra });
  const node = name => host.querySelector(`[data-e2-d3="${name}"]`);
  const marker = name => host.querySelector(`[data-e2-d3-marker="${name}"]`);
  const choose = value => { node('day').value = value; node('day').dispatchEvent({ type: 'change' }); };
  return { document, host, window, controller, node, marker, choose, onActivity };
}

function exact(value, unit = 'pg/mL') {
  return { status: 'valid', value, unit, operator: '=', isExact: true };
}

describe('E2 D3 — separate source panel and local measurement context', () => {
  it('shows the source P50 without borrowing an external Day-3 confirmation', () => {
    const ui = mount();
    ui.controller.update(context({ cycleDay: 'day3' }));
    expect(ui.host.hidden).toBe(false);
    expect(ui.node('day').value).toBe('unknown');
    expect(ui.node('median').textContent).toBe('56,336');
    expect(ui.node('median').getAttribute('data-source-value')).toBe('56.336');
    expect(ui.node('median').getAttribute('data-source-unit')).toBe('pg/mL');
    expect(ui.node('age-label').textContent).toContain('dla wpisanego wieku 30 lat');
    expect(ui.node('source-copy').textContent).toContain(data.source.population);
    expect(ui.node('source-copy').textContent).toContain(data.source.method);
    expect(ui.node('source-copy').textContent).toContain('10 pg/mL');
    expect(ui.marker('source')).not.toBeNull();
    expect(ui.marker('patient')).toBeNull();
    expect(ui.node('comparison').hidden).toBe(true);
    expect(ui.node('plot').open).toBe(false);
  });

  it('opens an exact comparison and preserves controls and focus on the same measurement refresh', () => {
    const ui = mount(), c = context();
    ui.controller.update(c);
    const select = ui.node('day'); select.focus();
    ui.choose('day3');
    expect(ui.marker('patient')).not.toBeNull();
    expect(ui.node('plot').open).toBe(true);
    ui.node('sources').open = true;
    ui.controller.update({ ...c, displayUnit: 'pmol/L' });
    expect(ui.node('day')).toBe(select);
    expect(ui.document.activeElement).toBe(select);
    expect(select.value).toBe('day3');
    expect(ui.node('plot').open).toBe(true);
    expect(ui.node('sources').open).toBe(true);
    expect(ui.node('patient-number').textContent).toBe('65,4 pg/mL');
    expect(ui.node('source-number').textContent).toBe('56,336 pg/mL');
    expect(ui.node('state').textContent).toContain('Metoda wyniku nieustalona');
    expect(ui.onActivity).toHaveBeenCalledWith({ kind: 'cycle-day', cycleDay: 'day3', patientPoint: true });
    ui.choose('other');
    expect(ui.marker('patient')).toBeNull();
    expect(ui.node('median').textContent).toBe('56,336');
    expect(ui.node('state').textContent).toContain('Inny dzień cyklu');
  });

  it('resets Day 3 and open details when the adapter changes the measurement or person binding', () => {
    const ui = mount();
    ui.controller.update(context()); ui.choose('day3'); ui.node('sources').open = true;
    ui.controller.update(context({ measurementKey: 'fictional-new-raw-or-context' }));
    expect(ui.node('day').value).toBe('unknown');
    expect(ui.node('plot').open).toBe(false);
    expect(ui.node('sources').open).toBe(false);
    expect(ui.marker('patient')).toBeNull();
    ui.choose('day3');
    ui.controller.update(context({ identityKey: 'fictional-d3-b', measurementKey: 'fictional-new-raw-or-context' }));
    expect(ui.node('day').value).toBe('unknown');
    expect(ui.node('patient-number').textContent).toBe('');
  });

  it('binds the fallback confirmation to raw result, source unit, age and clinical flags', () => {
    for (const changed of [
      { measurement: exact(70) }, { measurement: exact(65.4, 'pmol/L') },
      { ageYears: 31, ageUpperYears: 32 }, { cyclePhase: 'unknown' },
      { specimen: 'serum' }, { assayMethodId: 'advia-centaur-e2' },
      { hormonalTreatment: 'no' }, { stimulation: 'no' }, { gnrha: 'no' },
      { pregnancy: 'no' }, { measurementKind: 'basal' }
    ]) {
      const ui = mount(), c = context({ measurementKey: undefined });
      ui.controller.update(c); ui.choose('day3');
      expect(ui.marker('patient')).not.toBeNull();
      ui.controller.update({ ...c, ...changed });
      expect(ui.node('day').value).toBe('unknown');
      expect(ui.marker('patient')).toBeNull();
    }
  });

  it('keeps numeric inequalities and symbolic limits source-only after explicit Day 3', () => {
    for (const measurement of [
      { status: 'valid', value: 10, unit: 'pg/mL', operator: '<', isExact: false },
      { status: 'valid', value: 100, unit: 'pg/mL', operator: '>', isExact: false },
      { status: 'valid', value: 20, unit: 'pmol/L', operator: '≤', isExact: false },
      { status: 'valid', value: 20, unit: 'pmol/L', operator: '≥', isExact: false },
      { status: 'valid', value: null, unit: 'pg/mL', operator: '<', isExact: false, limitKind: 'LOD' },
      { status: 'valid', value: null, unit: 'pmol/L', operator: '<', isExact: false, limitKind: 'LOQ' }
    ]) {
      const ui = mount();
      ui.controller.update(context({ measurement })); ui.choose('day3');
      expect(ui.host.hidden).toBe(false);
      expect(ui.node('day').value).toBe('day3');
      expect(ui.node('median').textContent).toBe('56,336');
      expect(ui.marker('patient')).toBeNull();
      expect(ui.marker('overflow')).toBeNull();
      expect(ui.node('patient-number').textContent).toBe('');
      expect(ui.node('comparison').hidden).toBe(true);
      expect(ui.node('state').textContent).toContain('Dokładna wartość wyniku nie jest znana');
    }
  });

  it('uses source-owned E2 units and fixed axes independently of zero and very high values', () => {
    const ui = mount(); ui.controller.update(context());
    const curve = () => ui.host.querySelector('[data-e2-d3-curve="source"]').getAttribute('d');
    const original = curve();
    const yTicks = () => ui.host.querySelectorAll('[data-e2-d3-axis="y"]').map(node => node.getAttribute('data-axis-value'));
    const xTicks = () => ui.host.querySelectorAll('[data-e2-d3-axis="x"]').map(node => node.getAttribute('data-axis-value'));
    expect(yTicks()).toEqual(['0', '25', '50', '75', '100']);
    expect(xTicks()).toEqual(['19', '25', '30', '35', '40', '44']);
    ui.controller.update(context({ measurementKey: 'overflow', measurement: exact(206) })); ui.choose('day3');
    expect(ui.marker('overflow')).not.toBeNull(); expect(ui.marker('patient')).toBeNull();
    expect(ui.node('chart').textContent).toContain('206 pg/mL');
    expect(ui.node('patient-number').textContent).toBe('206 pg/mL');
    expect(curve()).toBe(original); expect(yTicks()).toEqual(['0', '25', '50', '75', '100']);
    ui.controller.update(context({ measurementKey: 'zero', measurement: exact(0) })); ui.choose('day3');
    expect(ui.marker('patient').getAttribute('cy')).toBe('230');
    expect(ui.marker('overflow')).toBeNull();
    expect(ui.node('patient-number').textContent).toBe('0 pg/mL'); expect(curve()).toBe(original);
  });

  it('does not round tiny patient values to zero or just-over-axis values to the axis limit', () => {
    const ui = mount();
    ui.controller.update(context({ measurementKey: 'tiny', measurement: exact(0.0001) })); ui.choose('day3');
    expect(ui.node('patient-number').textContent).toBe('0,0001 pg/mL');
    expect(ui.marker('patient')).not.toBeNull();
    ui.controller.update(context({ measurementKey: 'overflow', measurement: exact(100.0001) })); ui.choose('day3');
    expect(ui.node('patient-number').textContent).toBe('100,0001 pg/mL');
    expect(ui.node('chart').textContent).toContain('100,0001 pg/mL'); expect(ui.marker('overflow')).not.toBeNull();
  });

  it('renders the canonical patient point returned by the real evaluator for SI input', () => {
    const ui = mount();
    ui.controller.update(context({ measurement: exact(240.0834, 'pmol/L') })); ui.choose('day3');
    expect(ui.node('patient-number').textContent).toBe('65,4 pg/mL');
    expect(Number(ui.marker('patient').getAttribute('cy'))).toBeCloseTo(99.2, 12);
    expect(ui.marker('overflow')).toBeNull();
    expect(ui.node('source-number').textContent).toBe('56,336 pg/mL');
  });

  it('does not turn floating conversion noise at the upper axis into an overflow arrow', () => {
    const ui = mount();
    ui.controller.update(context({ measurement: exact(367.1, 'pmol/L') })); ui.choose('day3');
    // Geometry tolerance must not rewrite the real evaluator's patient value.
    expect(ui.node('patient-number').textContent).toBe('100,00000000000001 pg/mL');
    expect(Number(ui.marker('patient').getAttribute('cy'))).toBeCloseTo(30, 12);
    expect(ui.marker('overflow')).toBeNull();
    ui.controller.update(context({ measurementKey: 'genuine-overflow', measurement: exact(100.0001) })); ui.choose('day3');
    expect(ui.marker('overflow')).not.toBeNull();
  });

  it('reports interpolation without presenting a guessed exact age', () => {
    const ui = mount();
    ui.controller.update(context({ ageYears: 30.5, ageUpperYears: 30.5 + 1 / 12, ageLabel: '30 lat i 6 mies.' }));
    expect(ui.node('median').textContent).toBe('57,08');
    expect(Number(ui.node('median').getAttribute('data-source-value'))).toBeCloseTo(57.0795, 12);
    expect(ui.node('age-note').hidden).toBe(false);
    expect(ui.node('age-label').textContent).toContain('dla wpisanego wieku 30 lat i 6 mies.');
    ui.choose('day3'); expect(ui.marker('patient').getAttribute('cx')).toBe(ui.marker('source').getAttribute('cx'));
  });

  it('clears all numerical source content outside the complete supported age interval', () => {
    const ui = mount(); ui.controller.update(context()); ui.choose('day3');
    for (const age of [{ ageYears: 18, ageUpperYears: 19 }, { ageYears: 18.5, ageUpperYears: 19 },
      { ageYears: 44, ageUpperYears: 45 }, { ageYears: 43.99, ageUpperYears: 44.01 }]) {
      ui.controller.update(context(age));
      expect(ui.host.hidden).toBe(true); expect(ui.node('median').textContent).toBe('');
      expect(ui.node('source-copy').textContent).toBe(''); expect(ui.node('chart').children).toHaveLength(0);
      expect(ui.marker('patient')).toBeNull();
    }
    ui.controller.update(context({ ageYears: 44, ageUpperYears: 44, ageUpperInclusive: true, ageLabel: '44 lata' }));
    expect(ui.host.hidden).toBe(false); expect(ui.node('median').textContent).toBe('77,149');
    expect(ui.node('day').value).toBe('unknown');
  });

  it('keeps a conflicting phase source-only, then clears on a known incompatible context', () => {
    const ui = mount();
    ui.controller.update(context({ cyclePhase: 'luteal' })); ui.choose('day3');
    expect(ui.node('median').textContent).toBe('56,336'); expect(ui.marker('patient')).toBeNull();
    expect(ui.node('state').textContent).toContain('niespójna z D3');
    for (const c of [{ pregnancy: true }, { treatment: { sexSteroids: 'yes' } }, { cyclePhase: 'postmenopause' },
      { sampleDateISO: '2026-10-20' }, { contextBasis: 'historical' }, { specimen: 'plasma' }]) {
      ui.controller.update(context({ measurementKey: JSON.stringify(c), ...c }));
      expect(ui.host.hidden).toBe(true); expect(ui.node('median').textContent).toBe('');
      expect(ui.node('source-copy').textContent).toBe('');
      expect(ui.host.firstElementChild.getAttribute('data-source-id')).toBeNull();
      expect(ui.node('median').getAttribute('data-source-value')).toBeNull();
      expect(ui.node('chart').children).toHaveLength(0);
    }
    ui.controller.update(context());
    expect(ui.node('day').value).toBe('unknown'); expect(ui.marker('patient')).toBeNull();
  });

  it('hides view-only content without losing the same measurement local confirmation', () => {
    const ui = mount(), c = context();
    ui.controller.update(c); ui.choose('day3'); ui.controller.update({ ...c, compare: true });
    expect(ui.host.hidden).toBe(true); expect(ui.node('chart').children).toHaveLength(0);
    expect(ui.node('patient-number').textContent).toBe(''); ui.controller.update(c);
    expect(ui.node('day').value).toBe('day3'); expect(ui.marker('patient')).not.toBeNull();
    ui.controller.reset(); expect(ui.host.hidden).toBe(true); expect(ui.node('sources').open).toBe(false);
    ui.controller.update(c); expect(ui.node('day').value).toBe('unknown'); expect(ui.marker('patient')).toBeNull();
  });

  it('redraws only the E2 chart at narrow width without changing values, scale or confirmation', () => {
    const ui = mount(); ui.controller.update(context()); ui.choose('day3');
    const wide = ui.node('chart').getAttribute('viewBox');
    ui.host.clientWidth = 320;
    const resize = ui.window.addEventListener.mock.calls.find(call => call[0] === 'resize')[1]; resize();
    expect(wide).toBe('0 0 640 282'); expect(ui.node('chart').getAttribute('viewBox')).toBe('0 0 360 282');
    expect(ui.node('day').value).toBe('day3'); expect(ui.node('median').textContent).toBe('56,336');
    expect(ui.node('patient-number').textContent).toBe('65,4 pg/mL');
    expect(ui.host.querySelectorAll('[data-e2-d3-axis="y"]').map(node => node.getAttribute('data-axis-value'))).toEqual(['0', '25', '50', '75', '100']);
  });

  it('clears missing data and keeps separately mounted controls independent', () => {
    const unavailable = mount({ data: null });
    expect(unavailable.controller.update(context())).toBe(false);
    expect(unavailable.host.hidden).toBe(true); expect(unavailable.node('source-copy').textContent).toBe('');
    const ui = mount(), otherHost = ui.document.createElement('div');
    const other = ui.window.VildaE2D3UI.mount({ host: otherHost, data, engine });
    expect(other).not.toBeNull();
    expect(otherHost.querySelector('[data-e2-d3="day"]').getAttribute('id')).not.toBe(ui.node('day').getAttribute('id'));
    ui.controller.update(context()); ui.choose('day3'); ui.controller.clear();
    expect(ui.node('day').value).toBe('unknown'); expect(ui.node('median').textContent).toBe('');
    expect(ui.node('comparison').hidden).toBe(true);
  });
});
