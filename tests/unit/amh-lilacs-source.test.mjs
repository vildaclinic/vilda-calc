import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { beforeFshSourceRuntime, beforeInfantLhTailBundle } from '../support/prior-female-gonadotropin-bundle.mjs';

const require = createRequire(import.meta.url);
const ui = require('../../vilda_amh_lilacs_source_ui.js');
const runtime = require('../../vilda_hormone_lifespan_data.js');
const reference = require('../../vilda_hormone_lifespan_reference.js');
const parser = require('../../vilda_amh_age_reference.js');
const parserData = require('../../vilda_amh_age_reference_data.js');
const data = JSON.parse(readFileSync(new URL(
  '../../docs/clinical/hormone-lifespan/amh-lilacs-source-data.json', import.meta.url), 'utf8'));
const browserSource = readFileSync(new URL('../../vilda_amh_lilacs_source_ui.js', import.meta.url), 'utf8');
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const context = (ageYears = 85, extra = {}) => ({ sourceStatus: 'ready', analyte: 'amh', sex: 'male',
  identityKey: 'fictional-lilacs-person-a', ageYears,
  measurement: parser.parseMeasurement(parserData, '2', 'ng/mL'), ...extra });
const evaluate = (ageYears, extra) => ui.evaluate(data, context(ageYears, extra));

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

// A small DOM double executes the production mount, including its own HTML.
// The parser handles markup generically; it does not reproduce the card's
// selectors, source wording, eligibility rules or rendering decisions.
function documentDouble() {
  const doc = { createElement: tag => new Element(tag),
    createTextNode: text => { const node = new Element('#text'); node.textContent = text; return node; } };
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.children = [];
      this.attributes = {}; this._text = ''; this.hidden = false; this.open = false;
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
        if (selector.startsWith('.')) return String(node.className || node.getAttribute('class') || '').split(/\s+/).includes(selector.slice(1));
        return node.tagName === selector.toUpperCase();
      };
      return this.children.flatMap(child => [...(matches(child) ? [child] : []), ...child.querySelectorAll(selector)]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  }
  doc.body = doc.createElement('body');
  return doc;
}

describe('AMH LiLACS — published source information, not a patient reference', () => {
  it('keeps the independently transcribed whole-cohort median separate from all prior runtime data', () => {
    expect(runtime.amhLilacsSourceData).toEqual(data);
    expect(data).toMatchObject({ kind: 'published-cohort-information', analyte: 'amh', sex: 'male',
      ageDomain: { minYears: 80, maxYears: 90 },
      median: { value: 12.1, unit: 'pmol/L', approxNgMl: 1.7 },
      source: { id: 'chong2013-lilacs-male-amh', participants: 257, specimen: 'serum' },
      policy: { notClinicalReference: true, noPatientComparison: true, fullAgeIntervalRequired: true, ordinaryOnly: true } });
    expect(data.source.method).toContain('A16507');
    expect(data.source.method).toContain('DSL-10-14400');
    const { amhLilacsSourceData: _sourceOnly, e2PhaseSourceData: _e2SourceOnly, ...priorRuntime } = beforeFshSourceRuntime(runtime);
    // Frozen base594657f4: removing the two separate source-information fields
    // restores every earlier profile, geometry, policy and conversion verbatim.
    expect(digest(priorRuntime)).toBe('3bd76a0264cc097e81549d71bbd8aa2bb80611c3ff3ef18861f22a8294d78c4b');
    expect(digest(beforeInfantLhTailBundle(runtime.patientPointData))).toBe('28730dd407d52ef41afe8f2f5af5ab56ce541398e1c25d4dce5be5324a5ddcc9');
    expect(runtime.patientPointData.version).toBe('2026-10-26.1');
    expect(runtime.patientPointData.profiles).toHaveLength(85);
  });

  it('publishes the same real evaluator in CommonJS and an isolated browser VM without storage effects', () => {
    const sideEffect = vi.fn(() => { throw new Error('Source information must not persist patient data'); });
    const window = { localStorage: { getItem: sideEffect, setItem: sideEffect },
      sessionStorage: { getItem: sideEffect, setItem: sideEffect }, dispatchEvent: sideEffect };
    vm.runInNewContext(browserSource, { window });
    expect(window.VildaAmhLilacsSourceUI.evaluate(data, context())).toEqual(evaluate(85));
    expect(Object.keys(window.VildaAmhLilacsSourceUI).sort()).toEqual(['evaluate', 'mount']);
    expect(sideEffect).not.toHaveBeenCalled();
  });

  it.each([80, 80.000001, 85, 89.999999, 90])('shows the whole-cohort facts at exact age %s without deriving an age median', age => {
    expect(evaluate(age)).toMatchObject({ status: 'ready',
      median: { value: 12.1, unit: 'pmol/L', approxNgMl: 1.7 },
      ageDomain: { minYears: 80, maxYears: 90 }, source: { participants: 257 } });
    expect(evaluate(age)).toEqual(evaluate(85));
  });

  it('requires the entire possible current age to stay within 80–90, including its upper endpoint', () => {
    for (const [lower, upper, inclusive] of [[80, 81, false], [80, 90, true], [80, 90, false], [89, 90, false]]) {
      expect(evaluate(lower, { ageUpperYears: upper, ageUpperInclusive: inclusive }).status).toBe('ready');
    }
    for (const [lower, upper, inclusive] of [[79.99, 80, true], [79.99, 80.01, false],
      [89, 90.000001, false], [90, 91, false], [80, 91, false]]) {
      expect(evaluate(lower, { ageUpperYears: upper, ageUpperInclusive: inclusive }).status).toBe('unavailable');
    }
    for (const age of [70, 70.000001, 75, 79.999999, 90.000001, 91, 100]) {
      expect(evaluate(age).status).toBe('unavailable');
    }
    for (const ageYears of [null, undefined, '85', true, NaN, Infinity, -1]) {
      expect(evaluate(85, { ageYears }).status).toBe('unavailable');
    }
    for (const ageUpperYears of [84, '86', true, NaN, Infinity]) {
      expect(evaluate(85, { ageUpperYears }).status).toBe('unavailable');
    }
  });

  it('requires a ready current male AMH context and rejects historical sample contexts', () => {
    for (const sourceStatus of [undefined, null, '', 'loading', 'stale', 'unavailable']) {
      expect(evaluate(85, { sourceStatus }).status).toBe('unavailable');
    }
    for (const sex of [undefined, null, '', 'female', 'M', 'F']) expect(evaluate(85, { sex }).status).toBe('unavailable');
    for (const analyte of [undefined, null, '', 'fsh', 'inhb', 't', 'e2']) expect(evaluate(85, { analyte }).status).toBe('unavailable');
    expect(evaluate(85, { contextBasis: 'current-patient' }).status).toBe('ready');
    expect(evaluate(85, { contextBasis: 'sample' }).status).toBe('unavailable');
    expect(evaluate(85, { contextBasis: 'historical' }).status).toBe('unavailable');
    expect(evaluate(85, { sampleDateISO: '2025-01-01' }).status).toBe('unavailable');
  });

  it('limits the card to ordinary life view with AMH selected, independently of other selected hormones', () => {
    const expected = evaluate(85);
    for (const extra of [{ view: 'life' }, { view: 'life', compare: false },
      { view: 'life', selected: ['amh'] }, { view: 'life', selected: ['fsh', 'amh', 't'] }]) {
      expect(evaluate(85, extra)).toEqual(expected);
    }
    for (const view of ['minipuberty', 'puberty', 'cycle', 'unknown', null, '']) {
      expect(evaluate(85, { view }).status).toBe('unavailable');
    }
    for (const compare of [true, null, 0, 1, 'false', '']) {
      expect(evaluate(85, { view: 'life', compare }).status).toBe('unavailable');
    }
    for (const selected of [[], ['fsh'], ['AMH'], 'amh', null, {}]) {
      expect(evaluate(85, { view: 'life', selected }).status).toBe('unavailable');
    }
  });

  it('keeps source facts independent of patient concentration, assay, specimen or contraindication', () => {
    const expected = evaluate(85);
    for (const value of [0, 0.000001, 12.1, 1e12]) {
      for (const unit of ['ng/mL', 'pmol/L', 'μg/L']) {
        expect(evaluate(85, { measurement: parser.parseMeasurement(parserData, value, unit) })).toEqual(expected);
      }
    }
    for (const extra of [{ assayMethodId: 'access-amh' }, { assayMethodId: 'roche-elecsys' },
      { assayMethodId: 'amh-gen-ii-modified' }, { specimen: 'plasma' }, { specimen: 'saliva' },
      { contraindicated: true }, { contraindicated: true, assayMethodId: 'unmatched', specimen: 'plasma' }]) {
      expect(evaluate(85, extra)).toEqual(expected);
    }
    for (const key of ['value', 'measurement', 'identityKey', 'ratio', 'percentile', 'sds', 'classification',
      'referenceInterval', 'clinicalCutoff', 'referenceValue', 'patientPoint', 'profile', 'methodConfirmed']) {
      expect(expected).not.toHaveProperty(key);
    }
  });

  it('accepts reported inequalities and symbolic detection limits without imputing a patient concentration', () => {
    const expected = evaluate(85);
    for (const raw of ['0', '<0,1', '<=0,1', '≤0', '>2', '>=2', '≥2', '<LOD', '< LOQ', '≤LOD']) {
      const measurement = parser.parseMeasurement(parserData, raw, 'pmol/L');
      expect(measurement.status, raw).toBe('valid');
      const before = JSON.stringify(measurement);
      expect(evaluate(85, { measurement }), raw).toEqual(expected);
      expect(JSON.stringify(measurement)).toBe(before);
      if (measurement.censoring) expect(measurement.value).toBeNull();
    }
    for (const raw of ['', ' ', null, 'invalid', '-1', '>LOD', '<0', '1e999']) {
      expect(evaluate(85, { measurement: parser.parseMeasurement(parserData, raw, 'ng/mL') }).status, String(raw)).toBe('unavailable');
    }
    for (const measurement of [undefined, null, {}, { status: 'empty', value: 2, unit: 'ng/mL' },
      { status: 'invalid', value: 2, unit: 'ng/mL' }, { value: '2', unit: 'ng/mL' },
      { value: NaN, unit: 'ng/mL' }, { value: Infinity, unit: 'ng/mL' }, { value: -1, unit: 'ng/mL' },
      { value: 2, unit: 'IU/L' }, { value: 2, unit: 'ng/mL', operator: '~' },
      { value: null, unit: 'ng/mL', operator: '<' },
      { value: null, unit: 'ng/mL', operator: '>', censoring: 'LOD' }]) {
      expect(evaluate(85, { measurement }).status).toBe('unavailable');
    }
  });

  it('takes source facts from its argument without mutating inputs or returning writable aliases', () => {
    const supplied = structuredClone(data);
    supplied.median.value = 13; supplied.source.cohort = 'Fikcyjna kohorta testowa';
    const input = freeze(context()); freeze(supplied);
    const before = JSON.stringify({ supplied, input });
    const result = ui.evaluate(supplied, input);
    expect(result).toMatchObject({ status: 'ready', median: { value: 13 }, source: { cohort: 'Fikcyjna kohorta testowa' } });
    result.median.value = 99; result.ageDomain.minYears = 0;
    result.source.limitations.push('Fikcyjna zmiana testowa');
    expect(JSON.stringify({ supplied, input })).toBe(before);
    expect(data.median.value).toBe(12.1);
    for (const source of [null, {}, { ...data, median: null }, { ...data, ageDomain: { minYears: 90, maxYears: 80 } }]) {
      expect(ui.evaluate(source, context()).status).toBe('unavailable');
    }
  });

  it('leaves the ordinary patient comparison unavailable after 70, including ages with the information card', () => {
    expect(reference.evaluate(runtime.patientPointData, context(70)))
      .toMatchObject({ status: 'ready', profile: { id: 'tehrani2017-male-amh' } });
    for (const age of [70.000001, 75, 79.999999, 80, 85, 90]) {
      expect(reference.evaluate(runtime.patientPointData, context(age)))
        .toEqual({ status: 'unavailable', reason: 'unsupported-age' });
    }
  });
});

describe('AMH LiLACS — production card lifecycle', () => {
  function mount() {
    const document = documentDouble(), host = document.createElement('div');
    document.body.appendChild(host);
    const forbiddenWrite = () => { throw new Error('An informational source card must not write or dispatch patient changes'); };
    const window = { document, localStorage: { setItem: forbiddenWrite }, sessionStorage: { setItem: forbiddenWrite },
      VildaPersistence: { writeJSON: forbiddenWrite, writeShared: forbiddenWrite }, dispatchEvent: forbiddenWrite };
    vm.runInNewContext(browserSource, { window });
    const controller = window.VildaAmhLilacsSourceUI.mount({ host, data });
    return { host, controller, details: () => host.querySelector('details'),
      field: name => host.querySelector('[data-amh-lilacs="' + name + '"]') };
  }

  it('starts hidden, shows only source facts, and clears stale facts when the entry or context stops qualifying', () => {
    const card = mount();
    expect(card.host.hidden).toBe(true);
    expect(card.controller.update(context())).toBe(true);
    expect(card.host.hidden).toBe(false);
    expect(card.field('median').textContent).toContain('12,1');
    expect(card.field('equivalent').textContent).toContain('1,7');
    expect(card.field('cohort').textContent).toContain('257');
    expect(card.host.querySelectorAll('input')).toHaveLength(0);
    expect(card.host.querySelectorAll('select')).toHaveLength(0);
    expect(card.host.querySelectorAll('svg')).toHaveLength(0);
    for (const changed of [{ measurement: null }, { sourceStatus: 'loading' }, { ageYears: 75 },
      { sex: 'female' }, { analyte: 'fsh' }, { view: 'puberty' }, { compare: true }, { selected: ['fsh'] }]) {
      card.controller.update(context()); card.details().open = true;
      expect(card.controller.update(context(85, changed))).toBe(false);
      expect(card.host.hidden).toBe(true);
      expect(card.details().open).toBe(false);
      expect(card.field('median').textContent).toBe('');
      expect(card.field('sources').textContent).toBe('');
    }
  });

  it('closes expanded source information on patient changes and clear, without treating missing identity as another patient', () => {
    const card = mount();
    card.controller.update(context()); card.details().open = true;
    card.controller.update(context(86));
    expect(card.details().open).toBe(true);
    card.controller.update(context(85, { identityKey: 'fictional-lilacs-person-b' }));
    expect(card.details().open).toBe(false);
    card.details().open = true;
    card.controller.update(context(85, { identityKey: '' }));
    expect(card.details().open).toBe(false);
    card.details().open = true;
    card.controller.clear();
    expect(card.host.hidden).toBe(true);
    expect(card.details().open).toBe(false);
    expect(card.field('median').textContent).toBe('');
    expect(card.controller.update(context(85, { identityKey: '' }))).toBe(true);
    expect(card.details().open).toBe(false);
  });
});
