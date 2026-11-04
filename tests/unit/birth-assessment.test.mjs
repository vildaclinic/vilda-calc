import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sgaBirthEnvironment } from '../support/sga-birth-runtime.mjs';

const INPUT = {
  sourceChoice: 'compare', sourceKeys: ['niklasson', 'intergrowth', 'malewski'],
  sex: 'male', weeks: '34', days: '2', weight: '1650', length: '41', head: '30', hasComputed: false
};
const copy = value => JSON.parse(JSON.stringify(value));

function calculated(input = {}) {
  const h = sgaBirthEnvironment();
  h.api.restoreState({ ...INPUT, ...input });
  h.document.getElementById('computeSgaBirth').click();
  return { ...h, state: h.api.captureStateReadOnly() };
}

function collector(window) {
  const source = readFileSync(new URL('../../vilda_data_import_export.js', import.meta.url), 'utf8');
  const start = source.indexOf('function Bf1('), end = source.indexOf('function Bf2(', start);
  if (start < 0 || end < start) throw new Error('Cannot locate production birth collector');
  return new Function('r', 'de', `${source.slice(start, end)}; return Bf0;`)(window, copy);
}

describe('Saved SGA assessment from the production birth calculator', () => {
  it('captures each selected reference, existing interpretation and exact SDS without HTML', () => {
    const h = calculated(), saved = h.state.assessment;
    expect(saved.version).toBe(1);
    expect(saved.requestedSourceKeys).toEqual(INPUT.sourceKeys);
    expect(saved.sources.map(source => source.sourceKey)).toEqual(INPUT.sourceKeys);
    expect(saved.inputs).toEqual({ sex: 'male', weeks: 34, days: 2, weightG: 1650, lengthCm: 41, headCm: 30 });
    for (const source of saved.sources) {
      const engine = h.window.VildaSgaBirth.compute(source.sourceKey, saved.inputs);
      expect(source.sourceLabel).toBe(engine.sourceLabel);
      expect(source.metrics.weight.sds).toBe(engine.weightSds);
      if (source.sourceKey !== 'malewski') {
        expect(source.metrics.length.sds).toBe(engine.lengthSds);
        expect(source.metrics.head.sds).toBe(engine.headSds);
      } else {
        expect(source.metrics.length).toMatchObject({ sds: null, unavailable: true });
        expect(source.summary.lengthStatus).toBe('Niedostępne w tym źródle');
        expect(source.notes.join(' ')).toContain('34+2');
      }
      expect(source).not.toHaveProperty('cards');
      expect(source).not.toHaveProperty('cardCount');
    }
    expect(saved.sources[0].summary).toEqual({ weightStatus: 'TAK', lengthStatus: 'TAK' });
    expect(saved.sources[1].summary).toEqual({ weightStatus: 'NIE', lengthStatus: 'TAK' });
  });

  it('keeps atypical measurements and reasons for skipping requested references', () => {
    const { state } = calculated({ weeks: '22', days: '4', weight: '250', length: '30', head: '23' });
    expect(state.assessment.requestedSourceKeys).toEqual(INPUT.sourceKeys);
    expect(state.assessment.sources.map(source => source.sourceKey)).toEqual(['malewski']);
    expect(state.assessment.notes.join(' ')).toContain('nietypowa');
    expect(state.assessment.notes.filter(note => note.includes('pominięto'))).toHaveLength(2);
  });

  it('creates no historical result just by restoring a legacy hasComputed flag', () => {
    const h = sgaBirthEnvironment();
    h.api.restoreState({ ...INPUT, hasComputed: true });
    expect(h.document.getElementById('sgaBirthResults').dataset.hasComputed).toBe('1');
    expect(h.api.captureStateReadOnly()).not.toHaveProperty('assessment');
    expect(h.window.VildaBirthAssessment.read(h.api.captureStateReadOnly())).toBeNull();
  });

  it('restores the exact saved result and original date; only an explicit compute replaces it', () => {
    const h = calculated();
    h.state.assessment.computedAtISO = '2020-02-03T04:05:06.000Z';
    const fresh = sgaBirthEnvironment();
    fresh.api.restoreState(h.state);
    expect(fresh.api.captureStateReadOnly()).toEqual(h.state);
    const copyFromRead = fresh.api.captureStateReadOnly();
    copyFromRead.assessment.sources[0].metrics.weight.sds = 999;
    copyFromRead.assessment.notes.push('external edit');
    expect(fresh.api.captureStateReadOnly()).toEqual(h.state);
    fresh.document.getElementById('computeSgaBirth').click();
    const again = fresh.api.captureStateReadOnly().assessment;
    expect(again.computedAtISO).not.toBe(h.state.assessment.computedAtISO);
    expect(again.sources).toEqual(h.state.assessment.sources);
  });

  it('invalidates the saved assessment on edits and cannot resurrect it by undoing input values', () => {
    const h = calculated(), field = h.document.getElementById('sgaBirthWeight');
    field.value = '1700'; field.dispatch('input');
    expect(h.api.captureStateReadOnly()).not.toHaveProperty('assessment');
    expect(h.document.getElementById('sgaBirthResults').dataset.hasComputed).toBe('1');
    field.value = INPUT.weight; field.dispatch('input');
    expect(h.api.captureStateReadOnly()).not.toHaveProperty('assessment');
    h.document.getElementById('computeSgaBirth').click();
    expect(h.api.captureStateReadOnly().assessment.sources).toEqual(h.state.assessment.sources);
  });

  it('invalidates on sex/source changes and clears the assessment and carry on reset', () => {
    const h = calculated();
    h.sources[2].checked = false; h.sources[2].dispatch('change');
    expect(h.api.captureStateReadOnly()).not.toHaveProperty('assessment');
    h.api.restoreState(h.state);
    h.sex[0].checked = false; h.sex[1].checked = true; h.sex[1].dispatch('change');
    expect(h.api.captureStateReadOnly()).not.toHaveProperty('assessment');
    h.api.restoreState(h.state); h.window.vildaBirthData = h.state;
    h.document.getElementById('resetSgaBirth').click();
    expect(h.api.captureStateReadOnly()).not.toHaveProperty('assessment');
    expect(h.window.vildaBirthData).toBeNull();
  });

  it('does not expose stale results after a silent DOM change or failed explicit calculation', () => {
    const h = calculated();
    h.document.getElementById('sgaBirthWeight').value = '1800';
    expect(h.api.captureStateReadOnly()).not.toHaveProperty('assessment');
    h.document.getElementById('sgaBirthWeeks').value = '';
    h.document.getElementById('computeSgaBirth').click();
    expect(h.api.captureStateReadOnly()).not.toHaveProperty('assessment');
  });

  it('normalizes decimal commas and blank days exactly as the calculator does', () => {
    const h = calculated({ days: '', length: '41,5', head: '' });
    expect(h.state.assessment.inputs).toMatchObject({ days: 0, lengthCm: 41.5, headCm: null });
    const reader = h.window.VildaBirthAssessment;
    expect(reader.read({ ...h.state, length: '41.50', days: '0' })).toEqual(h.state.assessment);
  });

  it('transfers the complete snapshot through the real birth collector on DocPro and other pages', () => {
    const h = calculated(), onDocpro = collector(h.window)();
    expect(onDocpro).toEqual(h.state);
    const carried = collector({ vildaBirthData: onDocpro })();
    expect(carried).toEqual(h.state);
    carried.assessment.sources[0].summary.weightStatus = 'NIE';
    expect(onDocpro.assessment.sources[0].summary.weightStatus).toBe('TAK');
  });
});

describe('Assessment validation and detached pure reads', () => {
  it('rejects stale input/source selection, unsupported versions, malformed results and empty sources', () => {
    const h = calculated(), read = h.window.VildaBirthAssessment.read;
    const invalid = [
      state => { state.weight = '999'; },
      state => { state.sourceKeys.reverse(); },
      state => { state.hasComputed = false; },
      state => { state.assessment.version = 2; },
      state => { state.assessment.computedAtISO = 'yesterday'; },
      state => { state.assessment.computedAtISO = '2025-02-31T00:00:00.000Z'; },
      state => { state.assessment.sources = []; },
      state => { state.assessment.sources.push(copy(state.assessment.sources[0])); },
      state => { state.assessment.sources[0].sourceKey = 'unknown'; },
      state => { state.assessment.sources[0].metrics.weight.sds = Infinity; },
      state => { state.assessment.sources[0].summary.weightStatus = 'maybe'; },
      state => { delete state.assessment.sources[0].metrics.weight; },
      state => { state.assessment.sources[0].metrics.weight.unavailable = true; },
      state => { state.assessment.notes = [42]; }
    ];
    for (const mutate of invalid) {
      const state = copy(h.state); mutate(state); expect(read(state)).toBeNull();
    }
    expect(read(h.state)).toEqual(h.state.assessment);
  });

  it('copies only saved data without reading current reference tables or modifying the record', () => {
    const h = calculated(), before = copy(h.state), api = h.window.VildaBirthAssessment;
    h.window.VildaSgaBirth.compute = () => { throw new Error('Read must not calculate'); };
    delete h.window.SGA_INTERGROWTH_ZS; delete h.window.SGA_MALEWSKI_WEIGHT;
    const saved = api.read(h.state);
    saved.inputs.weightG = 0; saved.sources[0].notes.push('changed');
    saved.sources[0].metrics.weight.sds = 0;
    expect(h.state).toEqual(before);
    expect(api.read(h.state)).toEqual(before.assessment);
  });

  it('creates a detached snapshot and rejects invalid timestamps or missing results', () => {
    const h = calculated(), api = h.window.VildaBirthAssessment, now = '2025-01-02T03:04:05.000Z';
    const created = api.create(h.state, h.state.assessment.sources, now, ['stored warning']);
    expect(created.computedAtISO).toBe(now);
    expect(created.notes).toEqual(['stored warning']);
    created.sources[0].metrics.weight.sds = 1;
    expect(h.state.assessment.sources[0].metrics.weight.sds).not.toBe(1);
    expect(api.create(h.state, [], now)).toBeNull();
    expect(api.create(h.state, h.state.assessment.sources, 'invalid')).toBeNull();
  });
});
