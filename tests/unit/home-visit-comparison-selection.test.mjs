import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const win = {__VILDA_HOME_GABINET_PREVIEW__: true};
loadBrowserScript('vilda_home_visit_comparison_model.js', win);
loadBrowserScript('vilda_home_comparison_clinical.js', win);
const model = win.VildaHomeVisitComparisonModel;

function row(visitId, date, user = {}, meta = {}) {
  const visit = {patientId: 'a', visitId, clinicalDateISO: date, origin: 'explicit', ...meta};
  return {...visit, snapshotId: 's-' + visitId, rev: 2, payload: {visit, user}};
}
function state(item, mode = 'browse') {
  return {mode, visitId: item.visitId, date: item.clinicalDateISO, snapshotId: item.snapshotId, revision: item.rev};
}
const latest = row('third', '2026-11-22', {weight: '80,5'});
const sameDay = row('second', '2026-11-22', {weight: 81, measuredAtISO: '2026-11-20'});
const early = row('first', '2026-09-21', {weight: 85, height: 180});
const dayOnly = row('unknown', '2026-12-01', {weight: 70}, {origin: 'legacy-inferred', dateSource: 'savedAt'});
const foreign = row('foreign', '2026-12-02', {height: 169}, {patientId: 'b'});
const ordered = [foreign, dayOnly, latest, sameDay, early];

describe('Visit comparison uses canonical visits and explicit clinical dates', () => {
  it('selects the latest clinical record even when another save is newer or belongs to another patient', () => {
    expect(model.latest('a', ordered)).toBe(latest);
    expect(model.latest('a', [dayOnly])).toBe(dayOnly);
    expect(model.latest('b', [dayOnly])).toBeNull();
    expect(model.clinicalDate(dayOnly)).toBeNull();
    expect(model.clinicalDate({...dayOnly, origin: 'legacy-inferred', dateSource: 'measuredAt'})).toBe('2026-12-01');
  });
  it('compares distinct same-day visits in the vault order, without inventing a measurement day', () => {
    const result = model.select('a', ordered, state(latest), foreign.payload);
    expect(result).toMatchObject({current: latest, previous: sameDay, reference: sameDay, earlierMeasured: null, elapsedDays: 0});
    expect(model.measurementDate(latest)).toBeNull();
    expect(model.measurementDate(sameDay)).toBe('2026-11-20');
  });
  it('an empty predecessor stays visible; an explicit selection uses a single eligible earlier visit', () => {
    const partial = row('partial', '2026-11-15', {height: 180});
    const empty = row('empty', '2026-11-18');
    const rows = [latest, empty, partial, early];
    const pick = id => model.select('a', rows, state(latest), null, id);
    expect(pick(null)).toMatchObject({previous: empty, reference: empty, elapsedDays: 4, earlierMeasured: early});
    expect(pick(early.visitId)).toMatchObject({previous: empty, reference: early, elapsedDays: 62});
    expect(pick(partial.visitId).reference).toBe(empty);
  });
  it('uses only the earlier visits of the edited historical consultation', () => {
    const fresh = {...sameDay.payload, user: {weight: 79}};
    const match = model.select('a', ordered, state(sameDay, 'edit'), fresh);
    expect(match.previous).toBe(early);
    expect(match.current.payload.user.weight).toBe(79);
    expect(model.select('a', ordered, state(sameDay, 'edit'), latest.payload).current).toBeNull();
    expect(model.select('a', ordered, {...state(sameDay), revision: 1}, null).current).toBeNull();
    expect(model.select('a', ordered, state(sameDay, 'edit'), foreign.payload).current).toBeNull();
  });
  it('recognises a new consultation before and after a provisional save with its own visitId', () => {
    const draft = row('draft', '2026-11-22');
    const fresh = {...draft.payload, user: {weight: 80}};
    const editing = {...state(draft, 'new'), sourceDownSyndrome: true};
    const first = model.select('a', ordered, {...editing, snapshotId: null, revision: null}, fresh);
    expect(first.previous).toBe(latest);
    expect(first.current.payload.clinical.downSyndrome).toBe(true);
    expect(first.current.payload.user).toEqual({weight: 80});
    expect(model.select('a', [draft, ...ordered], editing, fresh).previous).toBe(latest);
    expect(model.select('a', [latest, draft, sameDay, early], editing, fresh).previous).toBe(sameDay);
  });
  it('never turns dates inferred from technical saves into a clinical interval', () => {
    const unknown = model.select('a', ordered, state(dayOnly), null);
    expect(unknown).toMatchObject({current: dayOnly, previous: null, elapsedDays: null});
    expect(model.measurementDate(row('empty', '2026-11-22', {measuredAtISO: '2026-11-22'}))).toBeNull();
    expect(model.measurementDate(row('x', '2026-11-22', {height: 176, measuredAtISO: '2026-02-31'}))).toBeNull();
  });
});
