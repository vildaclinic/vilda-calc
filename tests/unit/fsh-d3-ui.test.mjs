import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const engine = require('../../vilda_fsh_d3.js');
const parser = require('../../vilda_lab_puberty.js');
const data = JSON.parse(readFileSync(new URL('../../docs/clinical/hormone-lifespan/fsh-d3-data.json', import.meta.url), 'utf8'));
const source = readFileSync(new URL('../../vilda_fsh_d3_ui.js', import.meta.url), 'utf8');

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
    analyte: 'fsh', sex: 'female', ageYears: 30, ageUpperYears: 31, ageUpperInclusive: false,
    ageLabel: '30 lat', contextBasis: 'current-patient', cyclePhase: 'follicular',
    measurement: parser.parseMeasurement('7', 'IU/L'), ...extra };
}
function mount(extra = {}) {
  const document = documentDouble(), host = document.createElement('div'), onActivity = vi.fn();
  document.body.appendChild(host);
  const window = { innerWidth: 1440, addEventListener: vi.fn() };
  vm.runInNewContext(source, { window, Intl, Object, Number, JSON });
  const controller = window.VildaFshD3UI.mount({ host, data, engine, onActivity, ...extra });
  const node = name => host.querySelector(`[data-fsh-d3="${name}"]`);
  const marker = name => host.querySelector(`[data-fsh-d3-marker="${name}"]`);
  const choose = value => { node('day').value = value; node('day').dispatchEvent({ type: 'change' }); };
  return { document, host, window, controller, node, marker, choose, onActivity };
}

describe('FSH D3 — separate source panel and local measurement context', () => {
  it('shows the production source median without borrowing a Day-3 confirmation', () => {
    const ui = mount();
    ui.controller.update(context({ cycleDay: 'day3' }));
    expect(ui.host.hidden).toBe(false);
    expect(ui.node('day').value).toBe('unknown');
    expect(ui.node('median').textContent).toBe('5,941');
    expect(ui.node('median').getAttribute('data-source-value')).toBe('5.941');
    expect(ui.node('median').getAttribute('data-source-unit')).toBe('IU/L');
    expect(ui.node('age-label').textContent).toContain('dla wpisanego wieku 30 lat');
    expect(ui.node('source-copy').textContent).toContain(data.source.population);
    expect(ui.node('source-copy').textContent).toContain(data.source.method);
    expect(ui.marker('source')).not.toBeNull();
    expect(ui.marker('patient')).toBeNull();
    expect(ui.node('comparison').hidden).toBe(true);
    expect(ui.node('plot').open).toBe(false);
  });

  it('opens a qualified exact comparison and preserves the controls and focus during a same-context refresh', () => {
    const ui = mount(), c = context();
    ui.controller.update(c);
    const select = ui.node('day'); select.focus();
    ui.choose('day3');
    expect(ui.marker('patient')).not.toBeNull();
    expect(ui.node('plot').open).toBe(true);
    ui.node('sources').open = true;
    ui.controller.update({ ...c, displayUnit: 'mIU/mL' });
    expect(ui.node('day')).toBe(select);
    expect(ui.document.activeElement).toBe(select);
    expect(select.value).toBe('day3');
    expect(ui.node('plot').open).toBe(true);
    expect(ui.node('sources').open).toBe(true);
    expect(ui.node('patient-number').textContent).toBe('7 IU/L');
    expect(ui.onActivity).toHaveBeenCalledWith({ kind: 'cycle-day', cycleDay: 'day3', patientPoint: true });
    ui.choose('other');
    expect(ui.marker('patient')).toBeNull();
    expect(ui.node('median').textContent).toBe('5,941');
    expect(ui.node('state').textContent).toContain('Inny dzień cyklu');
  });

  it('resets Day 3 and expanded details when the adapter changes the measurement binding', () => {
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

  it('keeps inequalities and LOD/LOQ source-only after explicit Day 3', () => {
    for (const raw of ['<5', '>10', '<LOD', '<LOQ']) {
      const ui = mount();
      ui.controller.update(context({ measurement: parser.parseMeasurement(raw, 'IU/L') }));
      ui.choose('day3');
      expect(ui.host.hidden).toBe(false);
      expect(ui.node('day').value).toBe('day3');
      expect(ui.node('median').textContent).toBe('5,941');
      expect(ui.marker('patient')).toBeNull();
      expect(ui.marker('overflow')).toBeNull();
      expect(ui.node('patient-number').textContent).toBe('');
      expect(ui.node('comparison').hidden).toBe(true);
      expect(ui.node('plot').open).toBe(false);
      expect(ui.node('state').textContent).toContain('nie jest dokładną liczbą');
    }
  });

  it('retains the fixed source curve and ticks at zero and above-axis exact values', () => {
    const ui = mount();
    ui.controller.update(context());
    const curve = () => ui.host.querySelector('[data-fsh-d3-curve="source"]').getAttribute('d');
    const original = curve();
    const yTicks = () => ui.host.querySelectorAll('[data-fsh-d3-axis="y"]').map(node => node.getAttribute('data-axis-value'));
    expect(yTicks()).toEqual(['0', '3', '6', '9', '12']);
    ui.controller.update(context({ measurementKey: 'overflow', measurement: parser.parseMeasurement('12.0001', 'IU/L') }));
    ui.choose('day3');
    expect(ui.marker('overflow')).not.toBeNull();
    expect(ui.marker('patient')).toBeNull();
    expect(ui.node('chart').textContent).toContain('12,0001 IU/L');
    expect(ui.node('patient-number').textContent).toBe('12,0001 IU/L');
    expect(curve()).toBe(original); expect(yTicks()).toEqual(['0', '3', '6', '9', '12']);
    ui.controller.update(context({ measurementKey: 'zero', measurement: parser.parseMeasurement('0', 'IU/L') }));
    ui.choose('day3');
    expect(ui.marker('patient').getAttribute('cy')).toBe('230');
    expect(ui.marker('overflow')).toBeNull();
    expect(ui.node('patient-number').textContent).toBe('0 IU/L');
    expect(curve()).toBe(original);
  });

  it('reports the engine interpolation without presenting a guessed exact age', () => {
    const ui = mount();
    ui.controller.update(context({ ageYears: 30.5, ageUpperYears: 30.5 + 1 / 12, ageLabel: '30 lat i 6 mies.' }));
    expect(ui.node('median').textContent).toBe('5,998');
    expect(Number(ui.node('median').getAttribute('data-source-value'))).toBeCloseTo(5.9975, 12);
    expect(ui.node('age-note').hidden).toBe(false);
    expect(ui.node('age-label').textContent).toContain('dla wpisanego wieku 30 lat i 6 mies.');
    ui.choose('day3');
    expect(ui.marker('patient').getAttribute('cx')).toBe(ui.marker('source').getAttribute('cx'));
  });

  it('does not plot a conflicting phase, and does not revive Day 3 after an unavailable clinical context', () => {
    const ui = mount();
    ui.controller.update(context({ cyclePhase: 'luteal' })); ui.choose('day3');
    expect(ui.node('median').textContent).toBe('5,941');
    expect(ui.marker('patient')).toBeNull();
    expect(ui.node('state').textContent).toContain('niespójna z D3');
    ui.controller.update(context({ measurementKey: 'pregnancy', pregnancy: true }));
    expect(ui.host.hidden).toBe(true);
    expect(ui.node('median').textContent).toBe('');
    expect(ui.node('source-copy').textContent).toBe('');
    expect(ui.host.firstElementChild.getAttribute('data-source-id')).toBeNull();
    expect(ui.node('median').getAttribute('data-source-value')).toBeNull();
    expect(ui.node('chart').children).toHaveLength(0);
    ui.controller.update(context());
    expect(ui.node('day').value).toBe('unknown'); expect(ui.marker('patient')).toBeNull();
  });

  it('hides view-only content without losing the same measurement’s local confirmation', () => {
    const ui = mount(), c = context();
    ui.controller.update(c); ui.choose('day3');
    ui.controller.update({ ...c, compare: true });
    expect(ui.host.hidden).toBe(true); expect(ui.node('chart').children).toHaveLength(0);
    expect(ui.node('patient-number').textContent).toBe('');
    ui.controller.update(c);
    expect(ui.node('day').value).toBe('day3'); expect(ui.marker('patient')).not.toBeNull();
    ui.controller.reset();
    expect(ui.host.hidden).toBe(true); expect(ui.node('sources').open).toBe(false);
    ui.controller.update(c);
    expect(ui.node('day').value).toBe('unknown'); expect(ui.marker('patient')).toBeNull();
  });

  it('clears unavailable source data and uses independent IDs for independently mounted controls', () => {
    const unavailable = mount({ data: null });
    expect(unavailable.controller.update(context())).toBe(false);
    expect(unavailable.host.hidden).toBe(true); expect(unavailable.node('source-copy').textContent).toBe('');
    const ui = mount();
    const otherHost = ui.document.createElement('div');
    const other = ui.window.VildaFshD3UI.mount({ host: otherHost, data, engine });
    expect(other).not.toBeNull();
    expect(otherHost.querySelector('[data-fsh-d3="day"]').getAttribute('id')).not.toBe(ui.node('day').getAttribute('id'));
    ui.controller.update(context()); ui.choose('day3'); ui.controller.clear();
    expect(ui.node('day').value).toBe('unknown');
    expect(ui.node('median').textContent).toBe('');
    expect(ui.node('comparison').hidden).toBe(true);
  });
});
