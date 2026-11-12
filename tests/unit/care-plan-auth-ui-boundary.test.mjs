import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parse } from 'espree';
import { describe, expect, it, vi } from 'vitest';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const source = readFileSync(new URL('../../vilda_auth_ui.js', import.meta.url), 'utf8');
const tree = parse(source, { ecmaVersion: 'latest', range: true });
const declarations = new Map();
function visit(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'FunctionDeclaration') declarations.set(node.id.name, node);
  for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(visit); else visit(value);
}
visit(tree);
const functionSource = name => source.slice(...declarations.get(name).range);
const patientId = 'fictional-patient';
const audit = { operationId: 'fictional-operation', effectiveDateISO: '2001-02-03', recordedAtISO: '2001-02-03T12:00:00.000Z', recordedLocalDateISO: '2001-02-03', originTimeZone: 'Europe/Warsaw' };
function parent(note, tagged = false) {
  const plan = { id: 'fictional-plan', patientId, category: 'care-plan', title: 'Fikcyjny plan', rev: 1,
    careContext: { version: 2, role: 'plan', status: 'active', goal: '', stageOrder: ['fictional-stage'],
      stages: [{ id: 'fictional-stage', kind: 'regular', title: 'Fikcyjny etap', definitionOperationId: 'stage-definition', stepIds: ['fictional-step'], control: { state: 'planned', activation: null, review: null } }],
      steps: [{ id: 'fictional-step', stageId: 'fictional-stage', title: 'Fikcyjny krok', taskKind: 'examination', instruction: '', definitionOperationId: 'step-definition', requiredOutcome: 'resultReceipt', reminderRule: { kind: 'none' }, reminderSchedule: null, omission: null }],
      facts: [{ id: 'fictional-fact', stepId: 'fictional-step', kind: 'resultReceipt', ...audit, evidence: { noteId: note.id, sourceRecordRevAtCapture: 0 } }], factCorrections: [], associations: [], log: [] } };
  if (tagged) note.careContext = { version: 2, role: 'result', planId: plan.id, stageId: 'fictional-stage', stepId: 'fictional-step' };
  return plan;
}
function fixture() {
  const document = atrapaDokumentu(), note = { id: 'fictional-document', patientId, category: 'observation', title: 'Fikcyjny dokument', body: 'Fikcyjna oryginalna treść.', rev: 0 };
  const f = { note, plans: [], epoch: 1, locked: false, lockCallbacks: [] };
  const vault = { getPatientNote: vi.fn(async () => structuredClone(f.note)), listCarePlans: vi.fn(async () => structuredClone(f.plans)),
    listPatientNotesForPatient: vi.fn(async () => [structuredClone(f.note)]), removePatientNote: vi.fn(async () => {}),
    onLock: callback => { f.lockCallbacks.push(callback); return () => { f.lockCallbacks = f.lockCallbacks.filter(item => item !== callback); }; }, isUnlocked: () => !f.locked };
  const i = { document, confirm: vi.fn(() => true), setTimeout: () => 0 };
  loadBrowserScript('vilda_care_plan_model.js', i); loadBrowserScript('vilda_care_plans.js', i);
  const e = (tag, attributes, children) => {
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(attributes || {})) {
      if (key === 'text') element.textContent = value;
      else if (key.startsWith('on')) element.addEventListener(key.slice(2), value);
      else element.setAttribute(key, value);
    }
    (children || []).filter(Boolean).forEach(child => element.appendChild(child)); return element;
  };
  const deps = { i, e, jt: () => vault, remReadOwner: () => f.epoch, remReadCurrent: epoch => epoch === f.epoch && !f.locked,
    se: vi.fn(), Ot: vi.fn(), Gd5: vi.fn(), CareOpenLegacyNoteEditor: vi.fn(),
    oe: host => { host.textContent = ''; }, Me: { observation: { label: 'Obserwacja', color: '#000', bg: '#fff' } },
    gn: () => null, Jo: value => value.title, na: value => value,
    Lh3SavedAssessment: vi.fn(), HrSavedReference: vi.fn(), ClcrNotesCard: vi.fn() };
  const names = ['CareNoteDestination', 'CareLegacyReminderPlan', 'CareReadNoteAccess', 'CareDeleteCheckedNote', 'CareShowReadOnlyNote', 'ga', 'Xo'];
  const code = 'const {' + Object.keys(deps).join(',') + '}=deps; var CareEditorSequence=0;\n' + names.map(functionSource).join('\n') + '\nreturn {' + names.join(',') + '};';
  const api = new Function('deps', code)(deps);
  const host = document.createElement('section'); document.body.appendChild(host);
  f.document = document; f.host = host; f.api = api; f.vault = vault; f.deps = deps; f.i = i;
  f.lock = () => { f.locked = true; f.epoch++; f.lockCallbacks.slice().forEach(callback => callback()); };
  return f;
}
const button = (host, label) => host.querySelectorAll('button').find(item => item.textContent === label);
const settle = async () => { for (let index = 0; index < 10; index++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

describe('native notes and staged evidence respect the same document boundary', () => {
  it('preserves the entire legacy editor body byte for byte behind the new access gate', () => {
    const body = declarations.get('CareOpenLegacyNoteEditor').body;
    // Odświeżony świadomie 2026-11-12 (P-WYNIKI-BADAN-EDYTOR, prośba właściciela): opis kotwicy „Notatka ogólna”
    // zależy od kategorii — wynik badania trafia do Badań. Jedyna zmiana w treści edytora: x._wbOpis przy opisie,
    // odświeżenie opisu w Wt() i nasłuch zmiany kategorii; bramka dostępu i zapis bez zmian.
    expect(createHash('sha256').update(source.slice(...body.range)).digest('hex')).toBe('26321100044a3ee36ae0fabcbf5118be43819e16340c111261a06623d50cc582');
  });

  it('opens a genuinely new note synchronously without a needless patient-plan read', () => {
    const f = fixture(), args = { patientId, note: null };
    f.api.ga(args);
    expect(f.deps.CareOpenLegacyNoteEditor).toHaveBeenCalledExactlyOnceWith(args);
    expect(f.vault.getPatientNote).not.toHaveBeenCalled(); expect(f.vault.listCarePlans).not.toHaveBeenCalled();
  });

  it('rereads a standalone legacy document and opens only its newest exact record', async () => {
    const f = fixture(), old = { ...f.note, body: 'Stary widok.' };
    await f.api.ga({ patientId, note: old });
    expect(f.vault.getPatientNote).toHaveBeenCalledExactlyOnceWith(f.note.id);
    expect(f.vault.listCarePlans).toHaveBeenCalledExactlyOnceWith({ patientId });
    expect(f.deps.CareOpenLegacyNoteEditor).toHaveBeenCalledWith(expect.objectContaining({ note: f.note }));
  });

  it.each([true, false])('keeps captured evidence readonly with tagged=%s and routes to its verified parent', async tagged => {
    const f = fixture(); f.plans = [parent(f.note, tagged)];
    await f.api.ga({ patientId, note: f.note });
    expect(f.deps.CareOpenLegacyNoteEditor).not.toHaveBeenCalled();
    expect(f.document.body.textContent).toContain(f.note.body);
    expect(button(f.document.body, 'Edytuj')).toBeUndefined();
    button(f.document.body, 'Otwórz plan').click();
    expect(f.deps.se).toHaveBeenCalledWith(patientId, null, null, { activeTab: 'care', carePlanId: f.plans[0].id, careNoteId: f.note.id });
    expect(f.vault.removePatientNote).not.toHaveBeenCalled();
  });

  it.each([2, 99, 'future'])('keeps unsupported/orphan version %s readable without manufacturing a parent route', async version => {
    const f = fixture(); f.note.careContext = { version, role: 'result', planId: 'fictional-missing-parent' };
    await f.api.ga({ patientId, note: f.note });
    expect(f.document.body.textContent).toContain(f.note.body);
    expect(button(f.document.body, 'Otwórz plan')).toBeUndefined();
    expect(f.deps.CareOpenLegacyNoteEditor).not.toHaveBeenCalled();
  });

  it('closes and clears a readonly surface on lock without invoking its return callback', async () => {
    const f = fixture(), onCancel = vi.fn(); f.plans = [parent(f.note, true)];
    await f.api.ga({ patientId, note: f.note, onCancel });
    expect(f.document.body.textContent).toContain(f.note.body); f.lock();
    expect(f.document.body.textContent).not.toContain(f.note.body); expect(onCancel).not.toHaveBeenCalled();
    expect(f.lockCallbacks).toHaveLength(0);
  });

  it('does not open stale data after an account switch during the parent read', async () => {
    const f = fixture(), pending = deferred(); f.vault.listCarePlans.mockImplementation(() => pending.promise);
    const result = f.api.ga({ patientId, note: f.note }); f.epoch++; pending.resolve([]); await result;
    expect(f.deps.CareOpenLegacyNoteEditor).not.toHaveBeenCalled(); expect(f.document.body.textContent).not.toContain(f.note.body);
  });

  it('discards an earlier editor request if another document was selected before it resolved', async () => {
    const f = fixture(), pending = deferred(); f.vault.listCarePlans.mockImplementationOnce(() => pending.promise);
    const first = f.api.ga({ patientId, note: f.note });
    f.api.ga({ patientId, note: null }); pending.resolve([]); await first;
    expect(f.deps.CareOpenLegacyNoteEditor).toHaveBeenCalledTimes(1);
    expect(f.deps.CareOpenLegacyNoteEditor.mock.calls[0][0].note).toBeNull();
  });

  it('does not enter a legacy editor when current parent membership cannot be read', async () => {
    const f = fixture(); f.vault.listCarePlans.mockRejectedValue(new Error('Unavailable'));
    await f.api.ga({ patientId, note: f.note });
    expect(f.deps.CareOpenLegacyNoteEditor).not.toHaveBeenCalled(); expect(f.deps.Gd5).toHaveBeenCalled();
  });

  it('restores the caller navigation when its transferred original document cannot be reopened', async () => {
    const f = fixture(), returned = vi.fn(); f.vault.getPatientNote.mockResolvedValue(null);
    expect(await f.api.ga({ patientId, note: f.note, onCancel: returned })).toBe(false);
    expect(returned).toHaveBeenCalledTimes(1); expect(f.deps.CareOpenLegacyNoteEditor).not.toHaveBeenCalled();
  });

  it('blocks deletion of an original that became evidence after its Notes row was rendered', async () => {
    const f = fixture(); await f.api.Xo(f.host, patientId, vi.fn());
    const staleDelete = button(f.host, 'Usuń'); expect(staleDelete).toBeTruthy();
    f.plans = [parent(f.note, false)]; staleDelete.click(); await settle();
    expect(f.vault.removePatientNote).not.toHaveBeenCalled(); expect(f.i.confirm).not.toHaveBeenCalled();
    expect(button(f.document.body, 'Otwórz plan')).toBeTruthy();
  });

  it('deletes an unreferenced legacy document only after fresh verification and explicit confirmation', async () => {
    const f = fixture(), changed = vi.fn();
    expect(await f.api.CareDeleteCheckedNote(f.note, patientId, changed, () => true)).toBe(true);
    expect(f.i.confirm).toHaveBeenCalledTimes(1); expect(f.vault.removePatientNote).toHaveBeenCalledExactlyOnceWith(f.note.id);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('renders full evidence in Notes with Open plan instead of legacy edit and delete actions', async () => {
    const f = fixture(); f.plans = [parent(f.note, false)];
    await f.api.Xo(f.host, patientId, vi.fn());
    expect(f.host.textContent).toContain(f.note.body);
    expect(button(f.host, 'Edytuj')).toBeUndefined(); expect(button(f.host, 'Usuń')).toBeUndefined();
    button(f.host, 'Otwórz plan').click();
    expect(f.deps.se).toHaveBeenCalledWith(patientId, null, null, expect.objectContaining({ carePlanId: f.plans[0].id }));
  });

  it('keeps notes readable but disables legacy edits when parent verification fails', async () => {
    const f = fixture(); f.vault.listCarePlans.mockRejectedValue(new Error('Unavailable'));
    await f.api.Xo(f.host, patientId, vi.fn());
    expect(f.host.textContent).toContain(f.note.body); expect(f.host.textContent).toContain('Tylko do odczytu');
    expect(button(f.host, 'Edytuj')).toBeUndefined(); expect(button(f.host, 'Usuń')).toBeUndefined();
  });

  it('retains the Notes render ticket across asynchronous parent lookup', async () => {
    const f = fixture(), pending = deferred(); f.vault.listCarePlans.mockImplementationOnce(() => pending.promise);
    const older = f.api.Xo(f.host, patientId, vi.fn());
    f.note = { ...f.note, id: 'fictional-new-note', body: 'Nowszy widok.' };
    await f.api.Xo(f.host, patientId, vi.fn()); pending.resolve([]); await older;
    expect(f.host.textContent).toContain('Nowszy widok.'); expect(f.host.textContent).not.toContain('Fikcyjna oryginalna treść.');
  });

  it('admits only active format-1 plans to the legacy single-reminder addStep picker', () => {
    const f = fixture(), legacy = { id: 'fictional-legacy', version: 1, role: 'plan', status: 'active', steps: [], log: [] };
    expect(f.api.CareLegacyReminderPlan(legacy)).toBe(true);
    expect(f.api.CareLegacyReminderPlan({ ...legacy, status: 'closed' })).toBe(false);
    expect(f.api.CareLegacyReminderPlan(parent(f.note))).toBe(false);
    expect(f.api.CareLegacyReminderPlan({ ...legacy, version: 3 })).toBe(false);
    expect(f.api.CareLegacyReminderPlan({ ...legacy, version: undefined })).toBe(false);
    const actualLegacyDTO = { id: 'fictional-legacy', patientId, title: 'Fikcyjny plan', status: 'active', steps: [], log: [] };
    expect(f.api.CareLegacyReminderPlan(actualLegacyDTO)).toBe(true);
    expect(f.api.CareLegacyReminderPlan({ ...actualLegacyDTO, stageOrder: [] })).toBe(false);
    expect(f.api.CareLegacyReminderPlan({ ...actualLegacyDTO, formatVersion: 3 })).toBe(false);
  });
});
