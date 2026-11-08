import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const patientId = 'fictional-patient';
function api() { const win = { document: {} }; loadBrowserScript('vilda_care_plan_model.js', win); loadBrowserScript('vilda_care_plans.js', win); return win.VildaCarePlans; }
function audit() { return { operationId: 'fictional-operation', effectiveDateISO: '2001-02-03', recordedAtISO: '2001-02-03T12:00:00.000Z', recordedLocalDateISO: '2001-02-03', originTimeZone: 'Europe/Warsaw' }; }
function plan(id = 'fictional-plan') {
  return { id, patientId, category: 'care-plan', title: 'Fikcyjny plan', rev: 1, careContext: { version: 2, role: 'plan', status: 'active', goal: '', stageOrder: ['fictional-stage'],
    stages: [{ id: 'fictional-stage', kind: 'regular', title: 'Fikcyjny etap', definitionOperationId: 'stage-definition', stepIds: ['fictional-step'], control: { state: 'planned', activation: null, review: null } }],
    steps: [{ id: 'fictional-step', stageId: 'fictional-stage', title: 'Fikcyjny krok', taskKind: 'examination', instruction: '', definitionOperationId: 'step-definition', requiredOutcome: 'resultReceipt', reminderRule: { kind: 'none' }, reminderSchedule: null, omission: null }],
    facts: [], factCorrections: [], associations: [], log: [] } };
}
function evidence(parent, owned = true) {
  const note = { id: 'fictional-document', patientId, category: 'observation', title: 'Fikcyjny oryginał', body: 'Niezmieniona treść.', rev: 0 };
  if (owned) note.careContext = { version: 2, role: 'result', planId: parent.id, stageId: 'fictional-stage', stepId: 'fictional-step' };
  parent.careContext.facts.push({ id: 'fictional-fact', stepId: 'fictional-step', kind: 'resultReceipt', ...audit(), evidence: { noteId: note.id, sourceRecordRevAtCapture: 0 } });
  return note;
}
describe('Native care-plan documents stay visible and route through their exact protected parent', () => {
  it('keeps the exact original evidence object in Notes while providing a read-only parent route', () => {
    const parent = plan(), note = evidence(parent), original = JSON.stringify([parent, note]), actual = api();
    const projected = actual.projectPatientNotes([note], patientId, { plans: [parent] }); expect(projected).toEqual([note]); expect(projected[0]).toBe(note);
    expect(actual.resolveNoteDestination([note], note, patientId, { plans: [parent] })).toEqual({ kind: 'care', planId: parent.id, noteId: note.id, role: 'result', formatVersion: 2, readOnly: true, relatedPlans: [{ planId: parent.id, title: parent.title }] });
    expect(JSON.stringify([parent, note])).toBe(original);
  });
  it('protects original documents with no careContext by the reverse captured reference', () => {
    const parent = plan(), note = evidence(parent, false), actual = api();
    expect(actual.resolveNoteDestination([note], note, patientId, { plans: [parent] })).toMatchObject({ kind: 'care', planId: parent.id, noteId: note.id, role: 'document', formatVersion: 2, readOnly: true });
    expect(note.careContext).toBeUndefined(); expect(actual.projectPatientNotes([note], patientId, { plans: [parent] })).toContain(note);
  });
  it('resolves all related plans deterministically without relabelling a shared original', () => {
    const first = plan('fictional-first'), second = plan('fictional-second'), note = evidence(first, false); evidence(second, false);
    const result = api().resolveNoteDestination([note], note, patientId, { plans: [second, first] });
    expect(result.planId).toBe(first.id); expect(result.relatedPlans.map(entry => entry.planId)).toEqual([first.id, second.id]);
  });
  it('recognizes a captured legacy source without sending it to a legacy editor', () => {
    const parent = plan(), note = evidence(parent, false); note.careContext = { version: 1, role: 'result', planId: 'fictional-legacy-plan' };
    expect(api().resolveNoteDestination([note], note, patientId, { plans: [parent] })).toMatchObject({ kind: 'care', planId: parent.id, formatVersion: 2, readOnly: true });
  });
  it.each(['missing-parent', 'wrong-patient', 'wrong-step', 'invalid-parent', 'not-referenced'])('keeps %s native evidence readable with no invented route', kind => {
    const parent = plan(), note = evidence(parent), actual = api(); let plans = [parent];
    if (kind === 'missing-parent') plans = [];
    if (kind === 'wrong-patient') parent.patientId = 'fictional-other-patient';
    if (kind === 'wrong-step') note.careContext.stepId = 'fictional-other-step';
    if (kind === 'invalid-parent') parent.careContext.stageOrder = [];
    if (kind === 'not-referenced') parent.careContext.facts = [];
    expect(actual.projectPatientNotes([note], patientId, { plans })).toEqual([note]);
    expect(actual.resolveNoteDestination([note], note, patientId, { plans })).toEqual({ kind: 'notes', noteId: note.id, formatVersion: 2, readOnly: true, unavailable: true });
  });
  it('never redirects a different patient document even with a colliding identifier', () => {
    const parent = plan(), note = evidence(parent); note.patientId = 'fictional-other-patient';
    expect(api().resolveNoteDestination([note], note, patientId, { plans: [parent] })).toEqual({ kind: 'notes', noteId: note.id });
  });
  it('accepts log-backed reason documents and association-backed original records', () => {
    const parent = plan(), note = { id: 'fictional-document', patientId, category: 'observation', rev: 0 };
    parent.careContext.associations.push({ id: 'fictional-association', stepId: 'fictional-step', kind: 'document', noteId: note.id, sourceRecordRevAtCapture: 0, operationId: 'fictional-operation', recordedAtISO: '2001-02-03T12:00:00.000Z' });
    expect(api().resolveNoteDestination([note], note, patientId, { plans: [parent] })).toMatchObject({ readOnly: true, kind: 'care', planId: parent.id });
    parent.careContext.associations = []; note.careContext = { version: 2, role: 'decision', planId: parent.id, stageId: null, stepId: null };
    parent.careContext.log.push({ ...audit(), action: 'closePlan', stageId: null, stepId: null, documentIds: [note.id], text: 'Fikcyjna decyzja.' });
    expect(api().resolveNoteDestination([note], note, patientId, { plans: [parent] })).toMatchObject({ readOnly: true, kind: 'care', planId: parent.id, role: 'decision' });
  });
  it('does not infer an exact reserved reminder ID from a matching stage and step alone', () => {
    const parent = plan(), note = { id: 'fictional-forged-reminder', patientId, careContext: { version: 2, role: 'step', planId: parent.id, stageId: 'fictional-stage', stepId: 'fictional-step' } };
    expect(api().resolveNoteDestination([note], note, patientId, { plans: [parent] })).toMatchObject({ kind: 'notes', readOnly: true, unavailable: true });
  });
});
