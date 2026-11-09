import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
const clock = { recordedAtISO: '2026-11-08T12:00:00.000Z', recordedLocalDateISO: '2026-11-08', originTimeZone: 'Europe/Warsaw' };
async function fixture() {
  const document = new EventTarget();
  const win = { crypto: globalThis.crypto, TextEncoder, document, setTimeout, clearTimeout, addEventListener() {}, removeEventListener() {} };
  for (const name of ['vilda_care_plan_model.js', 'vilda_care_template_model.js', 'vilda_care_plan_mutation.js', 'vilda_global_search.js']) loadBrowserScript(name, win);
  const templates = win.VildaCareTemplateModel;
  const definition = templates.createDefinitionDraft({ stageId: 'source-stage', stepId: 'source-step' }).definition;
  definition.name = 'Fikcyjny wniosek etapowy'; definition.purpose = 'Fikcyjna kwalifikacja.';
  definition.stages[0].title = 'Fikcyjna diagnostyka';
  Object.assign(definition.steps[0], { title: 'Fikcyjny rezonans', instruction: 'Fikcyjny opis przysadki', requiredOutcome: 'resultReceipt', reminderRule: { kind: 'stage-offset', amount: 2, unit: 'day' } });
  definition.stageOrder.push('source-later'); definition.stages.push({ id: 'source-later', title: 'Fikcyjne zakończenie', stepIds: ['source-followup'] });
  definition.steps.push({ ...definition.steps[0], id: 'source-followup', stageId: 'source-later', title: 'Fikcyjne spotkanie', instruction: 'Fikcyjny przyszły krok' });
  const copied = templates.duplicateDefinition(definition, { stageIds: { 'source-stage': 'patient-stage', 'source-later': 'patient-later' }, stepIds: { 'source-step': 'patient-step', 'source-followup': 'patient-followup' } });
  const created = win.VildaCarePlanMutation.prepareTransaction(null, { action: 'createFromTemplate', operationId: 'fictional-create', planId: 'fictional-plan', patientId: 'fictional-patient', expectedRevision: null,
    draft: { source: { templateId: 'fictional-template', revisionId: 'fictional-revision', revisionNumber: 1, baseToken: 'a'.repeat(64), definition }, definition: copied.definition },
    documentIds: { reminders: { 'patient-step': 'fictional-reminder', 'patient-followup': 'fictional-later-reminder' } } }, clock);
  expect(created.ok).toBe(true);
  const f = { win, state: created.state, sequence: 0, search: null };
  f.change = (action, extra) => {
    const changed = win.VildaCarePlanMutation.prepareTransaction(f.state, { action, operationId: 'fictional-command-' + ++f.sequence, planId: 'fictional-plan', patientId: 'fictional-patient', expectedRevision: f.state.record.rev, ...extra }, clock);
    expect(changed.ok).toBe(true); f.state = changed.state;
  };
  const vault = { getCurrentUser: () => ({ userId: 'fictional-account' }), isUnlocked: () => true,
    listPatients: async () => [{ patientId: 'fictional-patient', header: { name: 'Fikcyjny Pacjent' } }],
    listExternalPatients: async () => [], listAllPatientNotes: async () => [], listCarePlans: async () => [f.state.record] };
  f.create = () => win.VildaGlobalSearch.create({ vault, document });
  return f;
}

describe('staged plans in global search', () => {
  it('indexes stage titles and instructions, retains original record and no fabricated dates', async () => {
    const f = await fixture(), search = f.create();
    const rows = await search.search('diagnostyka przysadki');
    expect(rows).toHaveLength(1); expect(rows[0].planId).toBe('fictional-plan');
    expect(rows[0].body).toContain('Fikcyjna diagnostyka'); expect(rows[0].dates).toEqual([]);
    expect(rows[0].source.careContext.version).toBe(2); expect(rows[0].source).not.toHaveProperty('steps');
    expect((await search.search('przyszły')).map(row => row.planId)).toEqual(['fictional-plan']); search.destroy();
  });
  it('shows only actual active-stage reminder dates and explicit waiting state', async () => {
    const f = await fixture();
    f.change('activateStage', { stageId: 'patient-stage', effectiveDateISO: '2026-11-01' });
    f.change('recordFact', { stepId: 'patient-step', factId: 'fictional-performed', kind: 'performance', effectiveDateISO: '2026-11-02', evidence: { noteId: 'fictional-original', sourceRecordRevAtCapture: 0 } });
    const search = f.create(), rows = await search.search('rezonans', { status: 'waiting' });
    expect(rows).toHaveLength(1); expect(rows[0].statusLabel).toBe('Oczekuję na wynik');
    expect(rows[0].dates).toEqual([{ kind: 'reminder', dateISO: '2026-11-03' }]); expect(rows[0].eventDateISO).toBeNull();
    search.destroy();
  });
  it('finds a closed staged plan as completed without leaving future work dates', async () => {
    const f = await fixture();
    f.change('activateStage', { stageId: 'patient-stage', effectiveDateISO: '2026-11-01' });
    f.change('closePlan', { reason: 'Fikcyjne zakończenie', text: 'Fikcyjna decyzja organizacyjna.', effectiveDateISO: '2026-11-08', documentId: 'fictional-close-document', confirmOpenWork: true });
    const search = f.create(), rows = await search.search('etapowy', { status: 'completed' });
    expect(rows).toHaveLength(1); expect(rows[0].statusLabel).toBe('Zamknięty'); expect(rows[0].dates).toEqual([]); search.destroy();
  });
});
