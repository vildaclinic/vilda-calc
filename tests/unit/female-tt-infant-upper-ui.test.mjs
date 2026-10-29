import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const engine = require('../../vilda_female_tt_infant_upper.js');
const tt = require('../../vilda_lab_testosterone.js');
const json = file => JSON.parse(readFileSync(new URL(`../../docs/clinical/hormone-lifespan/${file}`, import.meta.url), 'utf8'));
const data = json('female-tt-infant-upper-data.json');
const policy = json('female-tt-infant-upper-policy.json');
const source = readFileSync(new URL('../../vilda_female_tt_infant_upper_ui.js', import.meta.url), 'utf8');

// Generic DOM support only; every clinical decision comes from the real evaluator.
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
    gestationalAgeDays: 273, gestationalAgeUpperDays: 273, gestationalAgeUpperInclusive: true,
    specimen: 'serum', assayMethodId: 'lc-ms/ms', measurement: tt.parseMeasurement('0.15', 'nmol/L'), ...extra };
}
function mount(extra = {}) {
  const document = documentDouble(), host = document.createElement('div');
  const forbiddenWrite = () => { throw new Error('Source card cannot write patient or history data'); };
  const window = { addEventListener: vi.fn(), removeEventListener: vi.fn(),
    localStorage: { setItem: forbiddenWrite }, sessionStorage: { setItem: forbiddenWrite }, dispatchEvent: forbiddenWrite };
  vm.runInNewContext(source, { window, Intl, Object, Number });
  const onResult = vi.fn(), onActivity = vi.fn();
  const controller = window.VildaFemaleTTInfantUpperUI.mount({ host, data, policy, engine, onResult, onActivity, ...extra });
  const node = name => host.querySelector(`[data-female-tt-infant="${name}"]`);
  const marker = name => host.querySelector(`[data-female-tt-infant-marker="${name}"]`);
  const numbers = () => node('rows').querySelectorAll('strong').map(item => item.textContent);
  return { host, window, controller, node, marker, numbers, onResult, onActivity };
}

describe('female infant TT — source upper-percentile presentation', () => {
  it('shows a neutral concentration gauge and the literal upper source value, without a full RI or median', () => {
    const ui = mount(); expect(ui.host.hidden).toBe(true);
    const result = ui.controller.update(context());
    expect(result.status).toBe('ready'); expect(ui.host.hidden).toBe(false);
    expect(ui.numbers()).toEqual(['0,21']); expect(ui.node('age').textContent).toBe(data.groups[0].label);
    expect(ui.marker('patient').getAttribute('data-source-value')).toBe('0.15');
    expect(ui.marker('upper').getAttribute('data-source-value')).toBe('0.21');
    expect(ui.marker('track')).not.toBeNull();
    expect(ui.controller.getPresentation()).toMatchObject({ status: 'not-above-upper',
      statusLabel: 'Nie przekracza górnej wartości odniesienia', displayValue: '0,15', displayPrecision: 2 });
    expect(ui.node('gauge').getAttribute('aria-label')).toContain('nie oznacza pełnego zakresu normy');
    expect(ui.node('sources').open).toBe(false);
    expect(ui.node('source-copy').textContent).toContain('79,0%');
    expect(ui.node('source-copy').textContent).toContain('nie jest medianą');
    expect(ui.node('source-method').textContent).toBe(data.source.display.sourceMethodLabel);
    expect(ui.node('source-link').getAttribute('href')).toBe(data.source.url);
    expect(ui.host.querySelectorAll('input')).toHaveLength(0); expect(ui.host.querySelectorAll('select')).toHaveLength(0);
  });

  it('keeps the same fixed scale as the actual result goes from zero through overflow', () => {
    const ui = mount(); ui.controller.update(context());
    const track = ui.marker('track').attributes, upper = ui.marker('upper').attributes;
    ui.controller.update(context({ measurement: tt.parseMeasurement('0', 'nmol/L') }));
    expect(ui.marker('patient').getAttribute('data-source-value')).toBe('0');
    expect(ui.marker('patient').getAttribute('cx')).toBe('18');
    expect(ui.marker('track').attributes).toEqual(track);
    ui.controller.update(context({ measurement: tt.parseMeasurement('.8', 'nmol/L') }));
    expect(ui.marker('patient')).toBeNull(); expect(ui.marker('overflow').getAttribute('data-source-value')).toBe('0.8');
    expect(ui.node('overflow').textContent).toContain('0,80 nmol/L');
    expect(ui.node('overflow').hidden).toBe(false);
    expect(ui.marker('upper').attributes).toEqual(upper); expect(ui.marker('track').attributes).toEqual(track);
  });

  it.each([['<0.1', 'not-above-upper', '<0,10'], ['>0.21', 'above-upper', '>0,21'],
    ['>=0.21', 'indeterminate', '≥0,21'], ['<LOD', 'indeterminate', '<LOD'], ['<=LOQ', 'indeterminate', '≤LOQ']])(
    'preserves %s as a bound without plotting its numeric endpoint', (raw, status, text) => {
      const ui = mount(); ui.controller.update(context());
      ui.controller.update(context({ measurement: tt.parseMeasurement(raw, 'nmol/L') }));
      expect(ui.marker('patient')).toBeNull(); expect(ui.marker('overflow')).toBeNull();
      expect(ui.node('patient-key').hidden).toBe(true);
      expect(ui.controller.getPresentation()).toMatchObject({ status, displayValue: text });
    });

  it.each(['gestationalAgeDays', 'specimen', 'assayMethodId'])('keeps unknown %s source-only and removes the old patient point', key => {
    const ui = mount(); ui.controller.update(context());
    ui.controller.update(context({ [key]: undefined }));
    expect(ui.controller.getState().status).toBe('source-info'); expect(ui.numbers()).toEqual(['0,21']);
    expect(ui.node('gauge-wrap').hidden).toBe(true); expect(ui.node('gauge').children).toHaveLength(0);
    expect(ui.marker('patient')).toBeNull(); expect(ui.controller.getPresentation().statusLabel).toBe('Odniesienie źródłowe');
    expect(ui.host.textContent).not.toContain('metoda próbki niepotwierdzona');
  });

  it('shows both literal age groups without a combined verdict or reference gauge', () => {
    const ui = mount(); ui.controller.update(context({ ageUpperYears: 4 / 12, ageUpperInclusive: false }));
    expect(ui.controller.getState().status).toBe('split'); expect(ui.numbers()).toEqual(['0,21', '0,17']);
    expect(ui.node('rows').textContent).toContain(data.groups[0].label);
    expect(ui.node('rows').textContent).toContain(data.groups[1].label);
    expect(ui.node('gauge-wrap').hidden).toBe(true); expect(ui.marker('upper')).toBeNull();
    expect(ui.controller.getPresentation().statusLabel).toBe('Dwie grupy odniesienia');
  });

  it.each([{ ageYears: 1 / 12, ageUpperYears: 1 / 12 }, { gestationalAgeDays: 245 }, { specimen: 'plasma' },
    { assayMethodId: 'immunoassay' }, { hormonalTreatment: true }, { sourceStatus: 'locked' },
    { currentIdentityKey: 'fictional-infant-other' }, { sampleDateISO: '2026-01-01' }])(
    'clears the card and parent presentation on a context that cannot use the source: %j', extra => {
      const ui = mount(); ui.controller.update(context()); ui.node('sources').open = true;
      ui.controller.update(context(extra));
      expect(ui.host.hidden).toBe(true); expect(ui.numbers()).toEqual([]); expect(ui.node('sources').open).toBe(false);
      expect(ui.node('gauge').children).toHaveLength(0); expect(ui.node('source-copy').textContent).toBe('');
      expect(ui.controller.getPresentation()).toBeNull(); expect(ui.controller.getState()).toBeNull();
      expect(ui.onResult).toHaveBeenLastCalledWith(null, null);
    });

  it.each([['0.214', 'nmol/L', '0,214', '0,210', 3], ['0.0606', 'ng/mL', '0,06060', '0,06057', 5]])(
    'uses shared extra precision when %s %s rounds to the upper value', (raw, unit, displayed, limit, precision) => {
      const ui = mount(); const measurement = tt.parseMeasurement(raw, unit);
      ui.controller.update(context({ measurement, displayUnit: unit }));
      expect(ui.controller.getPresentation()).toMatchObject({ status: 'above-upper', displayValue: displayed, displayPrecision: precision });
      expect(ui.numbers()).toEqual([limit]); expect(ui.node('precision').hidden).toBe(false);
      expect(ui.node('precision').textContent).toContain('Dokładniejszy zapis');
      expect(ui.controller.getState().comparison.measurement.sourceValue).toBe(measurement.value);
      ui.controller.update(context({ measurement: tt.parseMeasurement('.3', 'nmol/L'), displayUnit: unit }));
      expect(ui.controller.getPresentation().displayPrecision).toBe(unit === 'ng/mL' ? 3 : 2);
      expect(ui.node('precision').hidden).toBe(true);
    });

  it('formats real conversions and very small positive values without altering source concentrations', () => {
    const ui = mount();
    for (const unit of policy.displayUnits) {
      ui.controller.update(context({ displayUnit: unit }));
      expect(ui.controller.getState().upper.sourceUpper).toBe(.21);
      expect(ui.controller.getState().comparison.patientPoint.sourceValue).toBe(.15);
      expect(Number(ui.marker('upper').getAttribute('x1'))).toBeCloseTo(251.1, 10);
    }
    ui.controller.update(context({ measurement: tt.parseMeasurement('0.0000001', 'nmol/L') }));
    expect(ui.controller.getPresentation().displayValue).not.toBe('0,00');
    expect(ui.controller.getPresentation().displayValue).toMatch(/[Ee]/);
  });

  it('resets details on identity changes while preserving them across ordinary result refreshes', () => {
    const ui = mount(); ui.controller.update(context()); ui.node('sources').open = true;
    ui.controller.update(context({ measurement: tt.parseMeasurement('.2', 'nmol/L') }));
    expect(ui.node('sources').open).toBe(true);
    ui.controller.update(context({ identityKey: 'fictional-infant-b', currentIdentityKey: 'fictional-infant-b' }));
    expect(ui.node('sources').open).toBe(false);
    const state = ui.controller.getState(); state.rows[0].value = 99;
    const p = ui.controller.getPresentation(); p.displayValue = 'changed';
    expect(ui.controller.getState().rows[0].value).toBe(.21); expect(ui.controller.getPresentation().displayValue).toBe('0,15');
    ui.controller.clear(); expect(ui.host.hidden).toBe(true); expect(ui.controller.getPresentation()).toBeNull();
    expect(ui.onActivity).not.toHaveBeenCalled();
  });

  it('only reports real local interactions and disposes all listeners without persistence', () => {
    const ui = mount(); ui.controller.update(context());
    ui.node('sources').dispatchEvent({ type: 'toggle', isTrusted: false }); expect(ui.onActivity).not.toHaveBeenCalled();
    const event = { type: 'toggle', isTrusted: true }; ui.node('sources').dispatchEvent(event);
    expect(ui.onActivity).toHaveBeenCalledWith(event, ui.window);
    ui.controller.destroy(); expect(ui.host.children).toHaveLength(0);
    expect(ui.window.removeEventListener).toHaveBeenCalled(); expect(ui.controller.update(context())).toBeNull();
  });
});
