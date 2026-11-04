import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { sgaBirthEnvironment } from '../support/sga-birth-runtime.mjs';

const MODEL = readFileSync(new URL('../../vilda_patient_sga_model.js', import.meta.url), 'utf8');
const COPY = readFileSync(new URL('../../vilda_patient_summary_copy.js', import.meta.url), 'utf8');
const BASE = {
  sourceChoice: 'niklasson', sourceKeys: ['niklasson'], sex: 'male', weeks: '34', days: '2',
  weight: '1650', length: '41', head: '29', hasComputed: false
};
const clone = value => JSON.parse(JSON.stringify(value));

function environment() {
  const h = sgaBirthEnvironment();
  vm.runInContext(MODEL, h.context, { filename: 'vilda_patient_sga_model.js' });
  vm.runInContext(COPY, h.context, { filename: 'vilda_patient_summary_copy.js' });
  return { ...h, model: h.window.VildaPatientSgaModel, copy: h.window.VildaPatientSummaryCopy };
}

function calculated(h, changes = {}) {
  h.api.restoreState({ ...BASE, ...changes });
  h.document.getElementById('computeSgaBirth').click();
  const birth = h.api.captureStateReadOnly();
  // Fixtures are actual persisted renderer output, not a second implementation of its thresholds.
  expect(birth.assessment).toBeTruthy();
  expect(h.window.VildaBirthAssessment.read(birth)).not.toBeNull();
  return birth;
}

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function expectUnevaluated(model) {
  expect(model).toMatchObject({ tone: 'improve', value: 'Do oceny', hasAssessment: false, computedAtISO: null, sources: [] });
}

describe('Patient SGA uses the saved assessment, with no evaluation on opening the card', () => {
  it('keeps old birth inputs visible without fabricating SDS, dates or a negative SGA conclusion', () => {
    const h = environment();
    const legacy = { ...BASE, hasComputed: true };
    const result = h.model.build(legacy);
    expectUnevaluated(result);
    expect(result.gestationLabel).toBe('34 tyg. + 2 dni');
    expect(result.measurements).toEqual([
      { key: 'weight', label: 'Masa urodzeniowa', valueLabel: '1650 g' },
      { key: 'length', label: 'Długość urodzeniowa', valueLabel: '41,0 cm' },
      { key: 'head', label: 'Obwód głowy', valueLabel: '29,0 cm' }
    ]);
    const text = h.model.summaryText(legacy);
    expect(text).toContain('SGA: Do oceny');
    expect(text).toContain('Brak zapisanej oceny SDS.');
    expect(text).not.toContain('−3,13');
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it.each([
    ['null', null], ['undefined', undefined], ['empty object', {}], ['array', []],
    ['no measurements', { sex: 'male', days: '0', hasComputed: true }]
  ])('omits the tile when no birth measurements or gestation were saved: %s', (_name, birth) => {
    const h = environment();
    expect(h.model.build(birth)).toBeNull();
    expect(h.model.summaryText(birth)).toBe('');
  });

  it('presents the real saved Niklasson result and retains its calculation timestamp', () => {
    const h = environment(), birth = calculated(h);
    const result = h.model.build(birth);
    expect(result).toMatchObject({ tone: 'alert', value: 'Tak', hasAssessment: true, subtitle: 'Masa i długość poniżej −2 SDS' });
    expect(result.computedAtISO).toBe(birth.assessment.computedAtISO);
    expect(result.sources[0]).toMatchObject({ sourceKey: 'niklasson', weightStatus: 'TAK', lengthStatus: 'TAK' });
    expect(result.sources[0].metrics.map(metric => metric.sdsLabel)).toEqual(['−3,13', '−3,48', '−2,29']);
    expect(result.sources[0].sourceLabel).toBe(birth.assessment.sources[0].sourceLabel);
  });

  it('does not call the calculator, capture another patient, write storage or mutate the saved record', () => {
    const h = environment(), birth = freeze(clone(calculated(h))), before = JSON.stringify(birth);
    const compute = vi.spyOn(h.window.VildaSgaBirth, 'compute').mockImplementation(() => { throw new Error('No recalculation on read'); });
    const capture = vi.spyOn(h.api, 'captureStateReadOnly').mockImplementation(() => { throw new Error('No current form on saved read'); });
    const writes = vi.spyOn(h.window.sessionStorage, 'setItem');
    const first = h.model.build(birth), firstText = h.model.summaryText(birth);
    first.sources[0].metrics[0].sdsLabel = 'changed presentation';
    first.notes.push('changed presentation');
    expect(h.model.build(birth).sources[0].metrics[0].sdsLabel).toBe('−3,13');
    expect(h.model.summaryText(birth)).toBe(firstText);
    expect(JSON.stringify(birth)).toBe(before);
    expect(compute).not.toHaveBeenCalled(); expect(capture).not.toHaveBeenCalled(); expect(writes).not.toHaveBeenCalled();
  });
});

describe('SGA conclusion follows the production renderer’s weight/length categories', () => {
  it('shows Nie only after both weight and length explicitly say NIE; a low head SDS does not diagnose SGA', () => {
    const h = environment(), birth = calculated(h, { weight: '2700', length: '48' });
    expect(birth.assessment.sources[0].summary).toEqual({ weightStatus: 'NIE', lengthStatus: 'NIE' });
    expect(birth.assessment.sources[0].metrics.head.interpretation).toBe('poniżej -2 SDS');
    const result = h.model.build(birth);
    expect(result).toMatchObject({ value: 'Nie', tone: 'ok', hasAssessment: true });
    expect(result.sources[0].metrics.find(metric => metric.key === 'head')).toMatchObject({ sdsLabel: '−2,29', tone: 'alert' });
  });

  it.each([
    [{ length: '', head: '' }, 'Masa poniżej −2 SDS'],
    [{ weight: '', head: '' }, 'Długość poniżej −2 SDS']
  ])('retains an explicit positive result when only one SGA criterion was measured: %j', (changes, subtitle) => {
    const h = environment(), birth = calculated(h, changes);
    expect(h.model.build(birth)).toMatchObject({ value: 'Tak', tone: 'alert', subtitle });
  });

  it('does not turn a normal weight with missing length into Nie', () => {
    const h = environment(), birth = calculated(h, { weight: '2700', length: '', head: '' });
    expect(birth.assessment.sources[0].summary).toEqual({ weightStatus: 'NIE', lengthStatus: 'Brak danych' });
    expect(h.model.build(birth)).toMatchObject({ value: 'Do oceny', tone: 'improve', hasAssessment: true, subtitle: 'Niepełne dane do oceny SGA' });
  });

  it('leaves a head-only result unevaluated for SGA while retaining its numeric assessment', () => {
    const h = environment(), birth = calculated(h, { weight: '', length: '' });
    const result = h.model.build(birth);
    expect(result).toMatchObject({ value: 'Do oceny', tone: 'improve', hasAssessment: true });
    expect(result.sources[0].metrics.find(metric => metric.key === 'head').sdsLabel).toBe('−2,29');
    expect(result.sources[0].metrics.find(metric => metric.key === 'weight').sdsLabel).toBe('—');
    expect(h.model.summaryText(birth)).toContain('SGA po masie: Brak danych; po długości: Brak danych.');
  });

  it('does not treat an unavailable length in Malewski as a negative length assessment', () => {
    const h = environment(), birth = calculated(h, { sourceChoice: 'malewski', sourceKeys: ['malewski'], weight: '2700', length: '48' });
    const result = h.model.build(birth);
    expect(result).toMatchObject({ value: 'Do oceny', tone: 'improve', hasAssessment: true });
    expect(result.sources[0].lengthStatus).toBe('Niedostępne w tym źródle');
    expect(result.sources[0].metrics.find(metric => metric.key === 'length')).toMatchObject({ sdsLabel: '—', tone: 'improve', interpretation: 'Niedostępne w tym źródle' });
  });

  it('keeps genuinely disagreeing reference assessments separate', () => {
    const h = environment(), birth = calculated(h, { sourceChoice: 'compare', sourceKeys: ['niklasson', 'intergrowth'], weight: '1500', length: '48' });
    expect(birth.assessment.sources.map(source => source.summary)).toEqual([
      { weightStatus: 'TAK', lengthStatus: 'NIE' }, { weightStatus: 'NIE', lengthStatus: 'NIE' }
    ]);
    const result = h.model.build(birth);
    expect(result).toMatchObject({ value: 'Różne oceny', tone: 'improve', hasAssessment: true });
    expect(result.sources.map(source => source.sourceKey)).toEqual(['niklasson', 'intergrowth']);
    expect(h.model.summaryText(birth)).toContain('SGA po masie: TAK; po długości: NIE.');
    expect(h.model.summaryText(birth)).toContain('SGA po masie: NIE; po długości: NIE.');
  });

  it('distinguishes an incomplete third source from an actual positive/negative disagreement', () => {
    const h = environment(), birth = calculated(h, { sourceChoice: 'compare', sourceKeys: ['niklasson', 'intergrowth', 'malewski'] });
    expect(birth.assessment.sources[2].summary).toEqual({ weightStatus: 'NIE', lengthStatus: 'Niedostępne w tym źródle' });
    expect(h.model.build(birth)).toMatchObject({ value: 'Do oceny', tone: 'improve', subtitle: 'Niepełna ocena dla części norm' });
  });

  it('retains agreement of two complete reference assessments', () => {
    const h = environment();
    const changes = { sourceChoice: 'compare', sourceKeys: ['niklasson', 'intergrowth'] };
    expect(h.model.build(calculated(h, changes))).toMatchObject({ value: 'Tak', tone: 'alert' });
    expect(h.model.build(calculated(h, { ...changes, weight: '2700', length: '48' }))).toMatchObject({ value: 'Nie', tone: 'ok' });
  });

  it('does not classify from rounded display values at the production engine boundary', () => {
    const h = environment();
    // Extra decimal places are intentional synthetic boundary probes, not suggested measurement precision.
    const above = calculated(h, { weight: '2700', length: '43.2143', head: '' });
    const below = calculated(h, { weight: '2700', length: '43.2142', head: '' });
    expect(above.assessment.sources[0].summary.lengthStatus).toBe('NIE');
    expect(below.assessment.sources[0].summary.lengthStatus).toBe('TAK');
    expect(h.model.build(above).sources[0].metrics[1].sdsLabel).toBe('−2,00');
    expect(h.model.build(below).sources[0].metrics[1].sdsLabel).toBe('−2,00');
    expect(h.model.build(above).value).toBe('Nie');
    expect(h.model.build(below).value).toBe('Tak');
  });
});

describe('Malformed and stale records remain measurements awaiting assessment', () => {
  it.each([
    ['changed measurement', birth => { birth.weight = '1800'; }],
    ['changed sex', birth => { birth.sex = 'female'; }],
    ['changed requested source', birth => { birth.sourceKeys = ['intergrowth']; birth.sourceChoice = 'intergrowth'; }],
    ['cleared calculation flag', birth => { birth.hasComputed = false; }],
    ['unknown summary category', birth => { birth.assessment.sources[0].summary.weightStatus = 'UNKNOWN'; }],
    ['empty result sources', birth => { birth.assessment.sources = []; }],
    ['malformed metric SDS', birth => { birth.assessment.sources[0].metrics.weight.sds = 'not a number'; }],
    ['invalid calculation date', birth => { birth.assessment.computedAtISO = 'not-a-date'; }],
    ['unsupported saved version', birth => { birth.assessment.version = 999; }]
  ])('does not expose stale or invalid SDS: %s', (_name, corrupt) => {
    const h = environment(), birth = clone(calculated(h)); corrupt(birth);
    expectUnevaluated(h.model.build(birth));
    const text = h.model.summaryText(birth);
    expect(text).toContain('Brak zapisanej oceny SDS.');
    expect(text).not.toContain('−3,13');
    expect(text).not.toContain('SGA: Nie');
  });

  it('does not color an unknown persisted metric interpretation as a normal result', () => {
    const h = environment(), birth = clone(calculated(h));
    birth.assessment.sources[0].metrics.weight.interpretation = 'Nieustalona interpretacja';
    expect(h.window.VildaBirthAssessment.read(birth)).not.toBeNull();
    const metric = h.model.build(birth).sources[0].metrics.find(item => item.key === 'weight');
    expect(metric).toMatchObject({ sdsLabel: '−3,13', interpretation: 'Nieustalona interpretacja', tone: 'improve' });
  });

  it('does not display an orphaned assessment when the birth fields are absent', () => {
    const h = environment(), birth = calculated(h);
    const orphaned = { assessment: birth.assessment, hasComputed: true };
    expect(h.model.build(orphaned)).toBeNull();
    expect(h.model.summaryText(orphaned)).toBe('');
  });
});

describe('Patient summary clipboard uses the same saved assessment as the tile', () => {
  it('includes birth-only records even when the current age and measurements are absent', () => {
    const h = environment(), birth = calculated(h);
    const direct = h.model.summaryText(birth);
    expect(h.copy.buildSummaryTextFromPayload({ birth })).toBe(direct);
    expect(h.copy.buildSummaryTextFromPayload({ user: {}, birth })).toBe(direct);
    expect(direct).toContain('Masa urodzeniowa: 1650 g, SDS −3,13.');
  });

  it('preserves the existing measurement summary and appends SGA once', () => {
    const h = environment(), birth = calculated(h);
    const payload = { user: { age: '6', ageMonths: '2', sex: 'M', weight: '16', height: '108' } };
    const original = h.copy.buildSummaryTextFromPayload(payload);
    expect(original).not.toBe('');
    const combined = h.copy.buildSummaryTextFromPayload({ ...payload, birth });
    expect(combined).toBe(original + '\n' + h.model.summaryText(birth));
    expect(combined.match(/^SGA:/gm)).toHaveLength(1);
    expect(h.copy.buildSummaryTextFromPayload(payload)).toBe(original);
  });

  it('copies older birth measurements explicitly without a saved numeric SDS', () => {
    const h = environment(), birth = { ...BASE, hasComputed: true };
    const text = h.copy.buildSummaryTextFromPayload({ birth });
    expect(text).toBe(h.model.summaryText(birth));
    expect(text).toContain('Długość urodzeniowa: 41,0 cm.');
    expect(text).toContain('Brak zapisanej oceny SDS.');
    expect(h.copy.buildSummaryTextFromPayload({})).toBe('');
  });
});
