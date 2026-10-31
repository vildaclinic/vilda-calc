import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const engine = require('../../vilda_female_tt_infant_median.js');
const tt = require('../../vilda_lab_testosterone.js');
const json = file => JSON.parse(readFileSync(new URL(`../../docs/clinical/hormone-lifespan/${file}`, import.meta.url), 'utf8'));
const data = json('female-tt-infant-median-data.json');
const policy = json('female-tt-infant-median-policy.json');
const source = readFileSync(new URL('../../vilda_female_tt_infant_median_ui.js', import.meta.url), 'utf8');

// Only DOM plumbing is doubled. Source qualification, parsing, conversion and
// the patient comparison all use the actual production evaluator and data.
function documentDouble() {
  const doc = { createElement: tag => new Element(tag), createElementNS: (_ns, tag) => new Element(tag) };
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.children = [];
      this.attributes = {}; this.listeners = {}; this._text = ''; this.hidden = false; this.open = false;
      this.clientWidth = 480;
    }
    get firstElementChild() { return this.children.find(child => child.tagName !== '#TEXT') || null; }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    set textContent(value) { this.replaceChildren(); this._text = String(value); }
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
    append(...children) { children.forEach(child => this.appendChild(child)); }
    replaceChildren(...children) { this.children = []; this._text = ''; this.append(...children); }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    getAttribute(key) { return this.attributes[key] ?? null; }
    removeAttribute(key) { delete this.attributes[key]; }
    addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
    removeEventListener(type, listener) { this.listeners[type] = (this.listeners[type] || []).filter(item => item !== listener); }
    dispatchEvent(event) { (this.listeners[event.type] || []).forEach(listener => listener(event)); }
    set innerHTML(html) {
      this.replaceChildren(); const stack = [this];
      for (const token of String(html).match(/<[^>]+>|[^<]+/g) || []) {
        if (token.startsWith('</')) { stack.pop(); continue; }
        if (token.startsWith('<')) {
          const tag = token.match(/^<([\w-]+)/)?.[1]; if (!tag) continue;
          const item = doc.createElement(tag);
          for (const match of token.slice(tag.length + 1).matchAll(/([\w-]+)(?:="([^"]*)"|'([^']*)')?/g)) {
            item.setAttribute(match[1], match[2] ?? match[3] ?? '');
          }
          stack.at(-1).appendChild(item); stack.push(item);
        } else { const text = doc.createElement('#text'); text.textContent = token; stack.at(-1).appendChild(text); }
      }
    }
    querySelectorAll(selector) {
      const matches = item => {
        const attr = selector.match(/^\[([^=\]]+)(?:=['"]?([^'"\]]+)['"]?)?\]$/);
        if (attr) return attr[2] === undefined ? item.getAttribute(attr[1]) !== null : item.getAttribute(attr[1]) === attr[2];
        return item.tagName === selector.toUpperCase();
      };
      return this.children.flatMap(child => [...(matches(child) ? [child] : []), ...child.querySelectorAll(selector)]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  }
  return doc;
}


function context(extra = {}) {
  return { sourceStatus: 'ready', identityKey: 'fictional-infant-a', currentIdentityKey: 'fictional-infant-a',
    contextBasis: 'current-patient', analyte: 'testosterone_total', sex: 'female',
    ageYears: .25, ageUpperYears: .25, ageUpperInclusive: true,
    postnatalDays: { lower: 101, upper: 102, source: 'main-calendar-dates' },
    gestationalAgeDays: 273, gestationalAgeUpperDays: 273, gestationalAgeUpperInclusive: true,
    specimen: 'serum', assayMethodId: 'lc-ms/ms', measurement: tt.parseMeasurement('.14', 'nmol/L'), ...extra };
}
function mount(extra = {}, extraWindow = {}) {
  const document = documentDouble(), host = document.createElement('div');
  const forbiddenWrite = () => { throw new Error('Group-median presentation must not write patient or history data'); };
  const window = { addEventListener: vi.fn(), removeEventListener: vi.fn(),
    localStorage: { setItem: forbiddenWrite }, sessionStorage: { setItem: forbiddenWrite }, dispatchEvent: forbiddenWrite,
    ...extraWindow };
  vm.runInNewContext(source, { window, Intl, Object, Number });
  const onActivity = vi.fn();
  const controller = window.VildaFemaleTTInfantMedianUI.mount({ host, data, policy, engine, onActivity, ...extra });
  const node = name => host.querySelector('[data-female-tt-infant-median="' + name + '"]');
  const marker = name => host.querySelector('[data-female-tt-infant-median-marker="' + name + '"]');
  const numbers = () => node('rows').querySelectorAll('strong').map(item => item.textContent);
  return { host, window, controller, node, marker, numbers, onActivity };
}

describe('female infant TT — literal group-median presentation', () => {
  it('presents the median and qualified exact point on a neutral axis without a laboratory verdict or extra fields', () => {
    const ui = mount(); expect(ui.host.hidden).toBe(true);
    const state = ui.controller.update(context());
    expect(state.status).toBe('ready'); expect(ui.host.hidden).toBe(false);
    expect(ui.node('heading').textContent).toBe('Mediana grupy wieku');
    expect(ui.node('age').textContent).toBe('31–180 dni');
    expect(ui.numbers()).toEqual(['0,13']);
    expect(ui.marker('patient').getAttribute('data-source-value')).toBe('0.14');
    expect(ui.marker('median').getAttribute('data-source-value')).toBe('0.13');
    expect(ui.node('comparison').textContent).toBe('1,08 × mediana grupy wieku');
    expect(ui.node('gauge-wrap').hidden).toBe(false);
    expect(ui.node('gauge').getAttribute('aria-label')).toContain('Mediana nie wyznacza granicy normy');
    expect(ui.host.textContent).not.toMatch(/w zakresie normy|powyżej normy|poniżej normy|✓/);
    expect(ui.host.querySelectorAll('input')).toHaveLength(0);
    expect(ui.host.querySelectorAll('select')).toHaveLength(0);
    expect(ui.node('sources').open).toBe(false);
    expect(ui.node('source-link').getAttribute('href')).toBe(data.source.url);
    expect(ui.node('source-copy').textContent).toContain(data.source.citation);
    expect(ui.node('source-method').textContent).toBe(data.source.display.sourceMethodLabel);
  });

  it('keeps the source-anchored scale stable from zero through overflow and shows the actual overflow value', () => {
    const ui = mount(); ui.controller.update(context());
    const track = { ...ui.marker('track').attributes }, median = { ...ui.marker('median').attributes };
    expect(ui.controller.getState().plot.valueMax).toBeCloseTo(.39, 12);
    ui.controller.update(context({ measurement: tt.parseMeasurement('0', 'nmol/L') }));
    expect(ui.marker('patient').getAttribute('cx')).toBe('18');
    expect(ui.node('comparison').textContent).toBe('0,00 × mediana grupy wieku');
    expect(ui.marker('track').attributes).toEqual(track);
    ui.controller.update(context({ measurement: tt.parseMeasurement('.8', 'nmol/L') }));
    expect(ui.marker('patient')).toBeNull();
    expect(ui.marker('overflow').getAttribute('data-source-value')).toBe('0.8');
    expect(ui.node('overflow').hidden).toBe(false);
    expect(ui.node('overflow').textContent).toBe('Wynik 0,80 nmol/L · ponad skalą →');
    expect(ui.node('gauge').getAttribute('aria-label')).toContain('Wynik ponad skalą');
    expect(ui.node('comparison').textContent).toBe('6,15 × mediana grupy wieku');
    expect(ui.marker('track').attributes).toEqual(track);
    expect(ui.marker('median').attributes).toEqual(median);
  });

  it.each(['<0.10', '<=0.10', '>0.10', '>=0.10', '<LOD', '<=LOQ'])(
    'retains the median but removes the exact point and ratio for %s', raw => {
      const ui = mount(); ui.controller.update(context());
      ui.controller.update(context({ measurement: tt.parseMeasurement(raw, 'nmol/L') }));
      expect(ui.numbers()).toEqual(['0,13']);
      expect(ui.marker('patient')).toBeNull(); expect(ui.marker('overflow')).toBeNull();
      expect(ui.node('gauge-wrap').hidden).toBe(true);
      expect(ui.node('gauge').children).toHaveLength(0);
      expect(ui.node('comparison').hidden).toBe(true); expect(ui.node('comparison').textContent).toBe('');
      expect(ui.node('note').textContent).toContain('nie wskazuje dokładnego stężenia');
      expect(ui.controller.getState().comparison.ratio).toBeNull();
    });

  it.each(['gestationalAgeDays', 'specimen', 'assayMethodId'])('keeps unknown %s as source information without stale point or a method badge', key => {
    const ui = mount(); ui.controller.update(context());
    ui.controller.update(context({ [key]: undefined }));
    expect(ui.controller.getState().status).toBe('source-info');
    expect(ui.numbers()).toEqual(['0,13']); expect(ui.node('gauge-wrap').hidden).toBe(true);
    expect(ui.node('gauge').children).toHaveLength(0); expect(ui.node('comparison').textContent).toBe('');
    expect(ui.host.textContent).not.toMatch(/metoda.*niepotwierdzona|metoda.*nieznana/);
  });

  it('shows both literal groups for an age interval crossing the source boundary, without a single gauge or ratio', () => {
    const ui = mount();
    ui.controller.update(context({ ageYears: 1 / 12, ageUpperYears: 1 / 12,
      postnatalDays: { lower: 30, upper: 31, source: 'main-calendar-dates' } }));
    expect(ui.controller.getState().status).toBe('split');
    expect(ui.node('heading').textContent).toBe('Mediany grup wieku');
    expect(ui.numbers()).toEqual(['0,19', '0,13']);
    expect(ui.node('rows').textContent).toContain('5–30 dni');
    expect(ui.node('rows').textContent).toContain('31–180 dni');
    expect(ui.node('gauge-wrap').hidden).toBe(true); expect(ui.marker('median')).toBeNull();
    expect(ui.node('comparison').textContent).toBe('');
    expect(ui.node('note').textContent).toContain('Brak pojedynczego porównania');
  });

  it.each([{ postnatalDays: undefined }, { ageYears: .5, ageUpperYears: .5 }, { gestationalAgeDays: 245 },
    { specimen: 'plasma' }, { assayMethodId: 'immunoassay' }, { hormonalTreatment: true }, { sga: true },
    { sourceStatus: 'locked' }, { currentIdentityKey: 'fictional-infant-other' }, { sampleDateISO: '2026-01-01' }])(
    'clears all presentation on a context outside this source: %j', extra => {
      const ui = mount(); ui.controller.update(context()); ui.node('sources').open = true;
      ui.controller.update(context(extra));
      expect(ui.host.hidden).toBe(true); expect(ui.controller.getState()).toBeNull();
      expect(ui.numbers()).toEqual([]); expect(ui.node('gauge').children).toHaveLength(0);
      expect(ui.node('sources').open).toBe(false); expect(ui.node('source-copy').textContent).toBe('');
      expect(ui.node('comparison').textContent).toBe('');
      expect(ui.node('source-link').getAttribute('href')).toBeNull();
      expect(ui.onActivity).not.toHaveBeenCalled();
    });

  it.each([['nmol/L', '0,13'], ['ng/dL', '3,75'], ['ng/mL', '0,037'], ['pg/mL', '37,50']])(
    'formats the real %s conversion without moving the median or changing its source value', (unit, displayed) => {
      const ui = mount(); ui.controller.update(context({ displayUnit: unit }));
      expect(ui.numbers()).toEqual([displayed]);
      expect(ui.controller.getState().median.sourceMedian).toBe(.13);
      expect(ui.node('comparison').textContent).toBe('1,08 × mediana grupy wieku');
      expect(Number(ui.marker('median').getAttribute('x1'))).toBeCloseTo(166, 10);
    });

  it('preserves a small positive exact value instead of rounding it to zero', () => {
    const ui = mount(); ui.controller.update(context({ measurement: tt.parseMeasurement('0.0000001', 'nmol/L') }));
    expect(ui.marker('patient').getAttribute('data-source-value')).toBe('1e-7');
    expect(ui.node('gauge').getAttribute('aria-label')).toMatch(/[Ee]/);
    expect(ui.node('comparison').textContent).not.toBe('0,00 × mediana grupy wieku');
  });

  it('takes source numbers from injected data and text safely from the source description', () => {
    const localData = structuredClone(data);
    localData.groups[1].median = .2;
    localData.source.url = 'javascript:throw Error("unsafe")';
    localData.source.display.details = ['<img src=x onerror="unsafe()">'];
    const ui = mount({ data: localData }); ui.controller.update(context());
    expect(ui.numbers()).toEqual(['0,20']);
    expect(ui.controller.getState().plot.valueMax).toBeCloseTo(.6, 12);
    expect(ui.node('source-link').hidden).toBe(true); expect(ui.node('source-link').getAttribute('href')).toBeNull();
    expect(ui.node('source-copy').textContent).toContain('<img src=x');
    expect(ui.host.querySelectorAll('img')).toHaveLength(0);
  });

  it('closes details on patient identity changes, preserves them on refresh, and returns detached state', () => {
    const ui = mount(); ui.controller.update(context()); ui.node('sources').open = true;
    ui.controller.update(context({ measurement: tt.parseMeasurement('.2', 'nmol/L') }));
    expect(ui.node('sources').open).toBe(true);
    ui.controller.update(context({ identityKey: 'fictional-infant-b', currentIdentityKey: 'fictional-infant-b' }));
    expect(ui.node('sources').open).toBe(false);
    const state = ui.controller.getState(); state.rows[0].value = 99;
    expect(ui.controller.getState().rows[0].value).toBe(.13); expect(ui.numbers()).toEqual(['0,13']);
  });

  it('reports only real summary activation and disposes handlers without any persistence or programmatic activity', () => {
    const ui = mount(); ui.controller.update(context());
    const summary = ui.node('sources').querySelector('summary');
    summary.dispatchEvent({ type: 'click', isTrusted: false });
    summary.dispatchEvent({ type: 'keydown', key: 'Tab', isTrusted: true });
    ui.node('sources').dispatchEvent({ type: 'toggle', isTrusted: true });
    expect(ui.onActivity).not.toHaveBeenCalled();
    const event = { type: 'click', isTrusted: true }; summary.dispatchEvent(event);
    expect(ui.onActivity).toHaveBeenLastCalledWith(event, ui.window);
    const keyboard = { type: 'keydown', key: 'Enter', isTrusted: true }; summary.dispatchEvent(keyboard);
    expect(ui.onActivity).toHaveBeenLastCalledWith(keyboard, ui.window);
    ui.controller.clear(); expect(ui.onActivity).toHaveBeenCalledTimes(2);
    ui.controller.destroy(); expect(ui.host.children).toHaveLength(0);
    summary.dispatchEvent(event); expect(ui.onActivity).toHaveBeenCalledTimes(2);
    expect(ui.window.removeEventListener).toHaveBeenCalled();
    expect(ui.controller.update(context())).toBeNull();
  });

  it('ignores a queued resize callback after destroy instead of restoring an old patient point', () => {
    let redraw, disconnected = false;
    class ResizeObserver {
      constructor(callback) { redraw = callback; }
      observe() {}
      disconnect() { disconnected = true; }
    }
    const ui = mount({}, { ResizeObserver });
    ui.controller.update(context()); ui.controller.destroy();
    expect(disconnected).toBe(true); expect(() => redraw()).not.toThrow();
    expect(ui.host.children).toHaveLength(0); expect(ui.controller.getState()).toBeNull();
  });
});
