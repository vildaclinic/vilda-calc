import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const observation = (stage, ageMonths = 144) => ({ stage, ageMonths, observedAtISO: null, source: 'clinician-entry' });
const user = (sex, axes) => ({ pubertyAssessment: { version: 1, sex, observations: { G: null, Th: null, P: null, ...axes } } });

// Production model selects the clinical axis; only the runtime source boundary is
// supplied here. Status, basic-card helper, tempo and trajectory are real modules.
function harness(payload, sex = 'M', ageMonths = 144, visit = {}) {
  const win = { document: { getElementById: () => null }, advHistoryResolveMetric: () => ({ result: { sd: 0, percentile: 50 }, source: 'SYNTHETIC' }) };
  loadBrowserScript('vilda_puberty_assessment.js', win);
  const assessmentContext = win.VildaPubertyAssessment.readUser(payload);
  win.VildaPubertyAssessmentContext = {
    readActiveContext: (opts) => ({
      assessmentContext,
      growth: win.VildaPubertyAssessment.gonadalContext(assessmentContext, { ...visit, ...opts, scope: 'growth' }),
    }),
  };
  loadBrowserScript('vilda_pubertal_status.js', win);
  loadBrowserScript('vilda_tempo_wzrastania.js', win);
  loadBrowserScript('vilda_trajectory_analysis.js', win);
  const status = win.VildaPubertalStatus.dane({ plec: sex, wiekLat: ageMonths / 12 });
  const context = win.VildaPubertalStatus.kontekstWzrastania({ plec: sex, wiekLat: ageMonths / 12 });
  return { win, status, context, assessmentContext };
}

describe('Typed puberty → growth consumers', () => {
  it.each(['M', 'F'])('P4 alone cannot suppress slow-growth assessment for %s', (sex) => {
    const { win, status, context } = harness(user(sex, { P: observation(4, 96) }), sex, 96);
    expect(status.etap).toBeNull();
    const v = win.VildaTempoWzrastania.ocenWartosc(2, 12, 96, sex, context);
    expect(v.basis).toBe('age');
    expect(v.alarm).toBe(true);
    expect(v.threshold.threshold).toBe(5);
  });

  it('a legacy V remains unspecified and cannot suppress the age norm', () => {
    const { win, status, context } = harness({ tannerStage: '5' }, 'F', 96);
    expect(status.etap).toBeNull();
    expect(status.assessmentContext.legacy).toEqual({ kind: 'unspecified', stage: 5 });
    expect(win.VildaTempoWzrastania.ocenWartosc(2, 12, 96, 'F', context).alarm).toBe(true);
  });

  it.each([
    { version: 1, sex: 'F', observations: { G: null, Th: null, P: null } },
    { version: 99, sex: 'F', observations: {} },
    { version: 1, sex: 'F', observations: { Th: { stage: 99 } } },
  ])('a present empty, unsupported or invalid assessment never revives legacy V', (assessment) => {
    const { win, status, context } = harness({ tannerStage: '5', pubertyAssessment: assessment }, 'F', 96);
    expect(status.etap).toBeNull();
    expect(win.VildaTempoWzrastania.ocenWartosc(2, 12, 96, 'F', context).alarm).toBe(true);
  });

  it.each([['M', 'G'], ['F', 'Th']])('uses only the qualifying gonadal axis for %s', (sex, kind) => {
    const { win, status, context } = harness(user(sex, { [kind]: observation(3), P: observation(5) }), sex);
    expect(status.etap).toBe(3);
    expect(status.etapRodzaj).toBe(kind);
    expect(status.wiekEtapuMies).toBe(144);
    const v = win.VildaTempoWzrastania.ocenWartosc(3, 12, 144, sex, context);
    expect(v.basis).toBe('tanner23');
    expect(v.severity).toBe('warn');
    expect(v.normLabel).toContain(kind + ' III');
  });

  it('changing P leaves the G-based velocity rule unchanged', () => {
    const a = harness(user('M', { G: observation(1), P: observation(2) }));
    const b = harness(user('M', { G: observation(1), P: observation(5) }));
    const va = a.win.VildaTempoWzrastania.ocenWartosc(3, 12, 144, 'M', a.context);
    const vb = b.win.VildaTempoWzrastania.ocenWartosc(3, 12, 144, 'M', b.context);
    expect(va).toEqual(vb);
    expect(va.alarm).toBe(true);
  });

  it('preserves the existing inclusive 12-month growth boundary', () => {
    const fresh = harness(user('M', { G: observation(1, 132) }));
    const stale = harness(user('M', { G: observation(1, 131.9) }));
    expect(fresh.status.etap).toBe(1);
    expect(fresh.status.wiekEtapuMies).toBe(132);
    expect(stale.status.etap).toBeNull();
    expect(stale.status.etapNieaktualny).toBe(true);
    expect(stale.status.etapPominiety).toBe(1);
  });

  it.each([null, 150])('does not qualify a historical observation with unknown/future age %s', (age) => {
    expect(harness(user('M', { G: observation(4, age) })).status.etap).toBeNull();
  });

  it('uses the assessment date from the active visit when the consumer supplies no date override', () => {
    const oldDate = { ...observation(4), observedAtISO: '2024-10-15' };
    const { status } = harness(user('M', { G: oldDate }), 'M', 144, { measuredAtISO: '2026-10-15' });
    expect(status.etap).toBeNull();
    expect(status.etapNieaktualny).toBe(true);
    expect(status.etapPominiety).toBe(4);
  });

  it('a changed patient sex cannot turn source G into Th', () => {
    const { status } = harness(user('M', { G: observation(4), P: observation(4) }), 'F');
    expect(status.etap).toBeNull();
    expect(status.assessmentContext.assessment.observations.G.stage).toBe(4);
    expect(status.assessmentContext.assessment.observations.Th).toBeNull();
  });

  it.each([1, 2])('a previous Th%s does not contradict a later onset or menarche', stage => {
    const { win } = harness(user('F', { Th: observation(stage, 120) }), 'F', 132);
    const fields = { pubertyOnsetAge: '10.5', pubertyMenarcheAge: '10.5',
      pubertyGnrhaStatus: 'w-trakcie', pubertyGnrhaStopAge: '10' };
    win.document.getElementById = id => Object.hasOwn(fields, id) ? { value: fields[id] } : null;
    const result = win.VildaPubertalStatus.dane({ plec: 'F', wiekLat: 11 });
    expect(result.etap).toBe(stage);
    expect(result.etapOcena.current).toBe(false);
    expect(result.sprzecznosci.join(' ')).not.toMatch(/Menarche przy Tanner|etap to Tanner I/);
    expect(result.sprzecznosci.join(' ')).toContain('w trakcie');
    expect(result.sprzecznosci.join(' ')).toContain('wiek zakończenia');
  });

  it('keeps the IV/V rule while avoiding a promise that growth spurt has ended', () => {
    const { win, context } = harness(user('M', { G: observation(4, 96) }), 'M', 96);
    const v = win.VildaTempoWzrastania.ocenWartosc(2, 12, 96, 'M', context);
    expect(v.basis).toBe('tanner45');
    expect(v.alarm).toBe(false);
    expect(v.note).toContain('G IV');
    expect(v.note).toContain('nie potwierdza zakończenia');
    expect(v.note).not.toContain('deceleracja fizjologiczna');
  });

  it('the basic card helper reads the same typed context and retains bone-age context', () => {
    const { win, context } = harness(user('F', { Th: observation(2), P: observation(4) }), 'F');
    const src = fs.readFileSync(path.join(root, 'growth-basic-module.js'), 'utf8');
    const start = src.indexOf('function Bba(rows){');
    const end = src.indexOf('\nfunction z(){', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const helper = new Function('window', 'l', 'P', src.slice(start, end) + ';return Bba;')(
      win, (id) => id === 'sex' ? { value: 'F' } : null, () => 12,
    );
    expect(helper([])).toEqual(context);
    expect(helper([{ ageMonths: 140, boneAgeYears: 11 }]).boneAge).toEqual({ baMonths: 132, atAgeMonths: 140 });
  });

  it('trajectory keeps independent observations without making P into gonadarche', () => {
    const { win, context, assessmentContext } = harness(user('F', { P: observation(1, 162) }), 'F', 162);
    const m = win.VildaTrajectoryAnalysis.analyze({ sex: 'F', measurements: [{ ageMonths: 150, height: 145 }], currentAgeMonths: 162, currentHeight: 148, context });
    expect(m.context.tannerStage).toBeNull();
    expect(m.context.assessmentContext).toEqual(assessmentContext);
    expect(m.context.assessmentContext).not.toBe(assessmentContext);
    expect(m.delayedPuberty).toBe(false);
    m.context.assessmentContext.assessment.observations.P.stage = 5;
    expect(assessmentContext.assessment.observations.P.stage).toBe(1);
  });
});

describe('Explicit wrong-axis guards at the pure-engine boundary', () => {
  it.each(['P', 'unspecified', 'Th', null])('male velocity rejects kind %s', (kind) => {
    const win = loadBrowserScript('vilda_tempo_wzrastania.js', {});
    expect(win.VildaTempoWzrastania.ocenWartosc(2, 12, 96, 'M', { tannerStage: 5, tannerKind: kind }).alarm).toBe(true);
  });

  it('an unknown sex does not acquire a gonadal axis from the default female branch', () => {
    const win = loadBrowserScript('vilda_tempo_wzrastania.js', {});
    expect(win.VildaTempoWzrastania.ocenWartosc(2, 12, 96, '', { tannerStage: 5, tannerKind: 'Th' }).alarm).toBe(true);
  });

  it('trajectory cannot infer delayed gonadarche from P1', () => {
    const win = loadBrowserScript('vilda_tempo_wzrastania.js', { advHistoryResolveMetric: () => ({ result: { sd: 0, percentile: 50 }, source: 'SYNTHETIC' }) });
    loadBrowserScript('vilda_trajectory_analysis.js', win);
    const m = win.VildaTrajectoryAnalysis.analyze({ sex: 'F', measurements: [{ ageMonths: 150, height: 145 }], currentAgeMonths: 162, currentHeight: 148, context: { tannerStage: 1, tannerKind: 'P', mpSds: 0 } });
    expect(m.context.tannerStage).toBeNull();
    expect(m.delayedPuberty).toBe(false);
  });
});
