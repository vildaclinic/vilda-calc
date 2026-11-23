import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function models() {
  const win = loadBrowserScript('runtime/patient-profile-v1/model.js', {});
  const base = win.VildaPatientProfileModel;
  loadBrowserScript('runtime/profile-trash-v1/model.js', win);
  return { base, model: win.VildaPatientProfileModel };
}
const { base, model } = models();
const PID = 'fictional-profile-patient';
const LEGACY = 'legacy:' + 'a'.repeat(64);
const id = number => 'prf-' + String(number).padStart(8, '0') + '-1111-4111-8111-111111111111';
const typed = name => ({ user: { firstName: name || 'Jan', lastName: 'Fikcyjny', dobISO: '2016-11-03', sex: 'M' },
  advanced: { motherHeight: 165, fatherHeight: 180 } });
const raw = () => base.legacy({ user: { firstName: 'Jan  Fikcyjny', lastName: '  Przykładowy  ', dobISO: 'dawny błędny zapis', sex: 'X' },
  guardian: { phone: 12345, legacyImport: 'Fikcyjne metadane' }, advanced: { motherHeight: '165,5', fatherHeight: 'brak' },
  puberty: { onsetAgeYears: '9,5', cdgpDeclared: 'dawne' }, clinical: { downSyndrome: 'true' },
  perinatal: { gestationalWeeks: '37', recordedSource: { label: 'Fikcyjne źródło' } } }, {});
const baseline = data => ({ schemaVersion: 1, kind: 'patient-profile-legacy-baseline', parents: [],
  legacyRevisionId: LEGACY, data: data || raw() });
const revision = (parents = [], data = typed()) => ({ schemaVersion: 1, kind: 'patient-profile', parents, data,
  ...(parents.length ? {} : { legacyRevisionId: LEGACY }) });
const note = (number, context, extra = {}) => ({ id: id(number), patientId: PID, category: 'observation',
  createdAtISO: '2026-11-' + String(number).padStart(2, '0') + 'T10:00:00.000Z', profileContext: context, ...extra });
const project = notes => model.project(notes, { patientId: PID });

describe('immutable legacy profile baseline projection', () => {
  it('preserves malformed legacy facts exactly instead of coercing them into typed edits', () => {
    const data = raw(), context = baseline(data), before = JSON.stringify(data);
    expect(() => base.normalizeData(data)).toThrow();
    const normalized = model.normalize(context);
    expect(normalized).toEqual(context);
    expect(JSON.stringify(data)).toBe(before);
    expect(normalized.data).toMatchObject({ user: { firstName: 'Jan  Fikcyjny', dobISO: 'dawny błędny zapis', sex: 'X' },
      advanced: { motherHeight: '165,5', fatherHeight: 'brak' }, guardian: { phone: 12345 },
      clinical: { downSyndrome: 'true' } });
  });

  it('exposes a single faithful baseline as a ready editable head with its real revision ID', () => {
    const value = project([note(1, baseline())]);
    expect(value).toMatchObject({ status: 'ready', revisionId: id(1), heads: [id(1)], editable: true, data: raw() });
    expect(value.history).toHaveLength(1);
    expect(value.history[0]).toMatchObject({ revisionId: id(1), parents: [], data: raw() });
    expect(value.history[0]).not.toHaveProperty('context');
  });

  it('detaches returned baseline data and history from stored and input objects', () => {
    const source = note(1, baseline()), expected = structuredClone(source);
    const context = model.normalize(source.profileContext), view = project([source]);
    context.data.guardian.phone = 999;
    view.data.perinatal.recordedSource.label = 'Zmieniony widok';
    view.history[0].data.user.sex = 'M';
    expect(source).toEqual(expected);
  });

  it('keeps strict edit validation and all unrelated public APIs unchanged', () => {
    expect(Object.keys(model).sort()).toEqual(Object.keys(base).sort());
    for (const key of Object.keys(base).filter(key => !['normalize', 'project'].includes(key))) expect(model[key]).toBe(base[key]);
    expect(() => model.normalizeData(raw())).toThrow();
    expect(model.normalize(revision())).toEqual(base.normalize(revision()));
    expect(model.normalizeData(typed())).toEqual(base.normalizeData(typed()));
  });

  it('allows a strict repair revision to descend from the raw baseline without rewriting its facts', () => {
    const saved = [note(1, baseline()), note(2, revision([id(1)], typed('Naprawiony Jan')))];
    expect(project(saved)).toMatchObject({ status: 'ready', revisionId: id(2), data: typed('Naprawiony Jan'), editable: true });
    expect(project(saved).history[0].data).toEqual(raw());
    expect(saved[0].profileContext.data).toEqual(raw());
  });

  it('does not permit raw legacy exceptions in an ordinary new edit', () => {
    expect(() => model.normalize(revision([id(1)], raw()))).toThrow();
    const result = project([note(1, baseline()), note(2, revision([id(1)], raw()))]);
    expect(result.status).toBe('unsupported');
    expect(result.data).toBeNull(); expect(result.editable).toBe(false);
  });

  it('rejects extra visit data and fields outside the exact legacy subset', () => {
    const additional = [
      { ...raw(), age: 10 },
      { ...raw(), user: { ...raw().user, height: 139 } },
      { ...raw(), advanced: { ...raw().advanced, boneAgeYears: 9 } },
      { ...raw(), clinical: { downSyndrome: 'true', diagnosis: 'nie kopiować' } },
      { ...raw(), puberty: { ...raw().puberty, assessment: { stage: 2 } } },
      { ...raw(), birth: { weight: 2500 } },
    ];
    for (const data of additional) expect(() => model.normalize(baseline(data))).toThrow();
    expect(() => model.normalize({ ...baseline(), savedAtISO: '2026-11-03' })).toThrow();
  });

  it('does not silently repair the legacy K spelling inside a persisted baseline', () => {
    const data = { user: { firstName: 'Fikcyjna', lastName: 'Pacjentka', sex: 'K' } };
    expect(() => model.normalize(baseline(data))).toThrow();
    const extracted = base.legacy(data, {});
    expect(extracted.user.sex).toBe('F');
    expect(model.normalize(baseline(extracted)).data).toEqual(extracted);
  });

  it('rejects unsupported versions, non-root baselines and malformed legacy identifiers', () => {
    for (const context of [{ ...baseline(), schemaVersion: 2 }, { ...baseline(), parents: [id(1)] },
      { ...baseline(), legacyRevisionId: 'legacy:wrong' }, { ...baseline(), kind: 'patient-profile-legacy-baseline-v2' }]) {
      expect(() => model.normalize(context)).toThrow();
      expect(project([note(1, context)])).toMatchObject({ status: 'unsupported', data: null, editable: false });
    }
    expect(() => model.normalize({ ...baseline(), parents: Array(1) })).toThrow();
  });

  it('does not invoke raw accessors or lose hidden structural fields', () => {
    let calls = 0; const context = baseline();
    Object.defineProperty(context.data.user, 'sex', { enumerable: true, get() { calls += 1; return 'M'; } });
    expect(() => model.normalize(context)).toThrow(); expect(calls).toBe(0);
    const hidden = baseline(); Object.defineProperty(hidden.data, 'visitFacts', { value: 1, enumerable: false });
    expect(() => model.normalize(hidden)).toThrow();
  });

  it('keeps incomplete graph and cycle states read-only in mixed histories', () => {
    const missing = project([note(1, baseline()), note(2, revision([id(9)]))]);
    expect(missing).toMatchObject({ status: 'incomplete', data: null, revisionId: null, editable: false });
    const cycle = project([note(1, baseline()), note(2, revision([id(3)])), note(3, revision([id(2)]))]);
    expect(cycle).toMatchObject({ status: 'incomplete', data: null, revisionId: null, editable: false });
  });

  it('preserves concurrent heads until an explicit ordinary merge revision covers both', () => {
    const branches = [note(1, baseline()), note(2, revision([id(1)], typed('Pierwszy'))), note(3, revision([id(1)], typed('Drugi')))];
    expect(project(branches)).toMatchObject({ status: 'conflict', data: null, heads: [id(2), id(3)], editable: false });
    expect(project([...branches, note(4, revision([id(2), id(3)], typed('Uzgodniony')))]))
      .toMatchObject({ status: 'ready', revisionId: id(4), data: typed('Uzgodniony'), editable: true });
  });

  it('rejects reused IDs with different content and foreign ownership without exposing another profile', () => {
    const other = raw(); other.guardian.phone = 765;
    expect(project([note(1, baseline()), note(1, baseline(other))])).toMatchObject({ status: 'unsupported', data: null });
    expect(project([note(1, baseline()), note(2, revision(), { patientId: 'other-patient' })]))
      .toMatchObject({ status: 'unsupported', data: null, editable: false });
    expect(project([note(1, baseline()), note(1, baseline())])).toMatchObject({ status: 'ready', heads: [id(1)] });
    expect(project([note(1, baseline()), note(1, baseline())]).history).toHaveLength(1);
  });

  it('uses exactly the base behavior whenever no baseline is present', () => {
    const cases = [[], [note(1, revision())], [note(2, revision([id(9)]))],
      [note(1, revision()), note(2, revision())], [note(1, revision([id(2)])), note(2, revision([id(1)]))],
      [note(1, { ...revision(), schemaVersion: 8 })]];
    const options = { patientId: PID, legacyData: typed(), legacyToken: LEGACY };
    for (const notes of cases) expect(model.project(notes, options)).toEqual(base.project(notes, options));
  });

  it('does not add a new accessor read before delegating a baseline-free record', () => {
    let reads = 0; const source = { id: id(1), patientId: PID, category: 'observation' };
    Object.defineProperty(source, 'profileContext', { enumerable: true, get() { reads += 1; throw new Error('Unreadable context'); } });
    const options = { patientId: PID };
    expect(model.project([source], options)).toEqual(base.project([source], options));
    expect(reads).toBe(2);
  });
});
