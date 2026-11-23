import { readFileSync } from 'node:fs';
import { applyEncounterNoteEditorHooks, reverseEncounterNoteEditorHooks } from '../../tools/home-encounter-note-auth-hooks.mjs';
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

// Execute the real editor initialization, nested ownership helpers and button
// callbacks. Controls and Vault I/O alone are doubles; no rendered DOM or
// duplicated binding/save predicate is needed for these observation notes.
function nativeNoteEditorPart(predicate) {
  const matches = [];
  function collect(node) {
    if (!node || typeof node !== 'object') return;
    if (predicate(node)) matches.push(node);
    for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(collect); else collect(value);
  }
  collect(declarations.get('CareOpenLegacyNoteEditor').body);
  if (matches.length !== 1) throw Error('Ambiguous native note editor fixture boundary: ' + matches.length);
  return matches[0];
}
function nativeNoteButton(name) {
  const node = nativeNoteEditorPart(item => item.type === 'VariableDeclarator' && item.id.name === name);
  const callback = node.init.arguments[1].properties.find(item => item.key.name === 'onclick').value;
  return source.slice(...callback.range);
}
function documentationEditor({ host = 'home', note = null, optIn = true, decision = 'visit' } = {}) {
  const state = { current: true, callerCurrent: true };
  const origin = Object.freeze({ version: 1, visitId: 'fictional-original-visit', clinicalDateISO: '2026-11-23' });
  const binding = { visitContext: origin, isCurrent: vi.fn(() => state.current), ensureRecorded: vi.fn(async () => true) };
  const capture = vi.fn(() => decision === 'visit' ? binding : decision === 'general' ? null : { blocked: true, message: 'Fikcyjna odmowa wizyty.' });
  const alert = vi.fn(), saved = vi.fn(), cancelled = vi.fn();
  const i = { __VILDA_HOME_GABINET_PREVIEW__: optIn, alert, crypto: globalThis.crypto, setTimeout: () => 0 };
  i.parent = i;
  if (host === 'home') i.VildaHomeGabinet = { captureDocumentationBinding: capture };
  if (host === 'local') i.VildaHomeEncounter = { captureDocumentationBinding: capture };
  if (host === 'shell') i.parent = { VildaShell: { captureDocumentationBinding: capture } };
  const a = { savePatientNote: vi.fn(async () => ({ id: note?.id || 'fictional-general-note' })),
    savePatientNoteOnce: vi.fn(async payload => ({ id: payload.id, saved: true })) };
  const d = { isConnected: true, remove: vi.fn(() => { d.isConnected = false; }) };
  const control = value => ({ value, style: {}, focus: vi.fn() });
  const controls = { E: control('Fikcyjna obserwacja'), B: control('Fikcyjna treść.'), x: control('observation'),
    at: control(''), It: control(''), Pt: control(''), ce: control(note?.clinicalDateISO || '2025-12-19'),
    Dt: { checked: false }, Xt: { checked: true }, F: control('none'), Ie: { style: {}, textContent: '' }, la: {}, Ce: {} };
  const t = { patientId, note, ...(!note ? { suggestLinkedAge: 78 } : {}),
    onSaved: saved, onCancel: cancelled, isCurrent: () => state.callerCurrent };
  const deps = { i, a, d, t, ...controls, Y: () => null, p: null, Qzap: () => true,
    Qkonflikt: vi.fn(), Gd0: error => error.message, Ot: vi.fn() };
  const body = declarations.get('CareOpenLegacyNoteEditor').body.body;
  const variable = name => body.find(node => node.type === 'VariableDeclaration' && node.declarations.some(item => item.id.name === name));
  const initialization = source.slice(variable('EncounterEditor').range[0], declarations.get('EncounterEditorCurrent').range[1]);
  const ageStart = variable('Et').range[0], ageEnd = variable('Bt').range[0];
  const code = 'const {' + Object.keys(deps).join(',') + '}=deps;\n'
    + source.slice(...variable('n').range) + '\n' + initialization + '\n'
    + source.slice(ageStart, ageEnd) + '\n'
    + ['Qbase', 'QbaseU', 'QbaseN'].map(name => source.slice(...variable(name).range)).join('\n')
    + '\nreturn {capture:EncounterCaptureDocumentation,current:EncounterEditorCurrent,binding:EncounterBinding,origin:EncounterOrigin,age:Et,'
    + 'submit:(' + nativeNoteButton('la') + '),cancel:(' + nativeNoteButton('Ce') + ')};';
  const api = new Function('deps', code)(deps);
  return { api, state, origin, binding, capture, i, a, d, t, controls, alert, saved, cancelled, deps };
}

describe('native note editor captures one documentation visit', () => {
  it.each(['home', 'local', 'shell'])('captures the %s producer without requiring the inline patient card', host => {
    const f = documentationEditor({ host });
    expect(f.api.binding).toBe(f.binding);
    expect(f.capture).toHaveBeenCalledExactlyOnceWith(...(host === 'shell' ? [f.i, patientId] : [patientId]));
    expect(f.api.origin).toBe(f.origin);
    expect(f.api.age).toBeNull();
    expect(f.binding.ensureRecorded).not.toHaveBeenCalled();
    f.api.cancel();
    expect(f.cancelled).toHaveBeenCalledOnce();
    expect(f.binding.ensureRecorded).not.toHaveBeenCalled();
    expect(f.a.savePatientNote).not.toHaveBeenCalled();
    expect(f.a.savePatientNoteOnce).not.toHaveBeenCalled();
  });

  it('confirms only on Submit and saves against the original binding and independent event date', async () => {
    const f = documentationEditor();
    f.i.VildaHomeGabinet.captureDocumentationBinding = vi.fn(() => { throw Error('A replacement owner must not be adopted.'); });
    await f.api.submit();
    expect(f.binding.ensureRecorded).toHaveBeenCalledOnce();
    expect(f.a.savePatientNoteOnce).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      patientId, title: 'Fikcyjna obserwacja', linkedAgeMonths: null, clinicalDateISO: '2025-12-19', visitContext: f.origin,
    }), { isCurrent: f.api.current, requireActiveVisit: true });
    expect(f.a.savePatientNoteOnce.mock.calls[0][0].visitContext).toBe(f.origin);
    expect(f.i.VildaHomeGabinet.captureDocumentationBinding).not.toHaveBeenCalled();
    expect(f.a.savePatientNote).not.toHaveBeenCalled();
    expect(f.saved).toHaveBeenCalledOnce();
  });

  it('retains the generated note id when the same open form retries an unacknowledged write', async () => {
    const f = documentationEditor();
    f.a.savePatientNoteOnce.mockResolvedValueOnce({ saved: false });
    await f.api.submit();
    expect(f.d.isConnected).toBe(true); expect(f.saved).not.toHaveBeenCalled();
    await f.api.submit();
    const [first, second] = f.a.savePatientNoteOnce.mock.calls;
    expect(first[0].id).toMatch(/^visit-note-[a-f0-9]{32}$/);
    expect(second[0].id).toBe(first[0].id);
    expect(second[0].visitContext).toBe(first[0].visitContext);
    expect(f.capture).toHaveBeenCalledOnce();
    expect(f.a.savePatientNote).not.toHaveBeenCalled();
  });

  it.each(['binding', 'caller', 'detached', 'throw'])('refuses a lost %s scope before confirming or writing', async reason => {
    const f = documentationEditor();
    if (reason === 'binding') f.state.current = false;
    if (reason === 'caller') f.state.callerCurrent = false;
    if (reason === 'detached') f.d.isConnected = false;
    if (reason === 'throw') f.binding.isCurrent.mockImplementation(() => { throw Error('Fikcyjna utrata właściciela.'); });
    expect(f.api.current()).toBe(false);
    await f.api.submit();
    expect(f.binding.ensureRecorded).not.toHaveBeenCalled();
    expect(f.a.savePatientNoteOnce).not.toHaveBeenCalled();
    expect(f.a.savePatientNote).not.toHaveBeenCalled();
    expect(f.saved).not.toHaveBeenCalled();
  });

  it.each([false, true])('rechecks ownership after ensureRecorded resolves %s', async recorded => {
    const f = documentationEditor(), pending = deferred();
    f.binding.ensureRecorded.mockReturnValue(pending.promise);
    const writing = f.api.submit();
    expect(f.binding.ensureRecorded).toHaveBeenCalledOnce();
    if (recorded) f.state.current = false;
    pending.resolve(recorded); await writing;
    expect(f.a.savePatientNoteOnce).not.toHaveBeenCalled();
    expect(f.a.savePatientNote).not.toHaveBeenCalled();
    expect(f.saved).not.toHaveBeenCalled();
    expect(f.d.isConnected).toBe(true);
  });

  it('does not publish a completed write into a different context after its awaited receipt', async () => {
    const f = documentationEditor(), pending = deferred(), audit = vi.fn();
    f.i.VildaAuditLog = { log: audit };
    f.a.savePatientNoteOnce.mockReturnValue(pending.promise);
    const writing = f.api.submit();
    await settle();
    expect(f.a.savePatientNoteOnce).toHaveBeenCalledOnce();
    expect(f.a.savePatientNoteOnce.mock.calls[0][1].isCurrent()).toBe(true);
    f.state.current = false;
    pending.resolve({ saved: true, id: 'fictional-committed-note' });
    await writing;
    expect(f.saved).not.toHaveBeenCalled(); expect(f.d.remove).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled(); expect(f.capture).toHaveBeenCalledOnce();
  });

  it.each(['blocked', 'missing'])('stops a new form with a visible %s producer decision', reason => {
    const f = documentationEditor({ host: reason === 'missing' ? 'missing' : 'home', decision: 'blocked' });
    expect(f.api).toBeUndefined(); expect(f.alert).toHaveBeenCalledOnce();
    expect(f.a.savePatientNoteOnce).not.toHaveBeenCalled(); expect(f.a.savePatientNote).not.toHaveBeenCalled();
  });

  it('accepts an explicit general-document decision without manufacturing a visit or a manual age anchor', async () => {
    const f = documentationEditor({ decision: 'general' });
    f.controls.Xt.checked = false;
    expect(f.api.binding).toBeNull(); expect(f.api.age).toBeNull();
    await f.api.submit();
    const payload = f.a.savePatientNote.mock.calls[0][0];
    expect(payload).toMatchObject({ patientId, linkedAgeMonths: null, clinicalDateISO: null });
    expect(payload).not.toHaveProperty('visitContext');
    expect(f.a.savePatientNoteOnce).not.toHaveBeenCalled(); expect(f.binding.ensureRecorded).not.toHaveBeenCalled();
  });

  it.each([true, false])('preserves an existing note origin=%s without acquiring or ensuring the current visit', async hasOrigin => {
    const original = { version: 1, visitId: 'fictional-historical-visit', clinicalDateISO: '2024-06-17' };
    const note = { id: 'fictional-existing-note', patientId, linkedAgeMonths: 63, clinicalDateISO: hasOrigin ? '2024-06-16' : null,
      rev: 4, updatedAtISO: '2024-06-18T12:00:00.000Z', ...(hasOrigin ? { visitContext: original } : {}) };
    const f = documentationEditor({ note, decision: 'blocked' });
    if (!hasOrigin) { f.controls.Dt.checked = true; f.controls.Xt.checked = false; }
    expect(f.capture).not.toHaveBeenCalled(); expect(f.api.age).toBe(63);
    await f.api.submit();
    const payload = f.a.savePatientNote.mock.calls[0][0];
    expect(payload).toMatchObject({ id: note.id, patientId, linkedAgeMonths: 63,
      clinicalDateISO: note.clinicalDateISO, baseRev: note.rev, baseUpdatedAtISO: note.updatedAtISO, baseNote: note });
    if (hasOrigin) expect(payload.visitContext).toBe(original);
    else expect(payload).not.toHaveProperty('visitContext');
    expect(f.binding.ensureRecorded).not.toHaveBeenCalled(); expect(f.a.savePatientNoteOnce).not.toHaveBeenCalled();
  });

  it('keeps the legacy manual age anchor outside the optional homepage', async () => {
    const f = documentationEditor({ optIn: false });
    f.controls.Dt.checked = true; f.controls.Xt.checked = false;
    expect(f.api.age).toBe(78); expect(f.capture).not.toHaveBeenCalled();
    await f.api.submit();
    expect(f.a.savePatientNote).toHaveBeenCalledWith(expect.objectContaining({ linkedAgeMonths: 78, clinicalDateISO: null }));
    expect(f.a.savePatientNoteOnce).not.toHaveBeenCalled();
  });
});

describe('native notes and staged evidence respect the same document boundary', () => {
  it('preserves the entire legacy editor body byte for byte behind the new access gate', () => {
    const body = declarations.get('CareOpenLegacyNoteEditor').body;
    // Odświeżony świadomie 2026-11-12 (P-WYNIKI-BADAN-EDYTOR, prośba właściciela): opis kotwicy „Notatka ogólna”
    // zależy od kategorii — wynik badania trafia do Badań. Jedyna zmiana w treści edytora: x._wbOpis przy opisie,
    // odświeżenie opisu w Wt() i nasłuch zmiany kategorii; bramka dostępu i zapis bez zmian.
    // Odświeżony świadomie 2026-11-15 (P-BADANIA-WEJSCIE, decyzja właściciela): nowa notatka nie ma szablonu
    // „Wynik badania” — nowego wyniku nie wpisuje się ręcznie. Jedyna zmiana w treści edytora: lista szablonów S
    // dostaje pozycję „lab” tylko, gdy edytor otwarto z tym szablonem (w === "lab"); bramka dostępu i zapis bez zmian.
    // Odświeżony świadomie 2026-11-16 (E3-PR0b2a, P-KONFLIKT-ZAPISU-NOTATKI): edytor pamięta chwilę zapisu otwartej
    // wersji (QbaseU) i wysyła ją jako baseUpdatedAtISO, a „Nadpisz moją wersją” podnosi ją z wersji w sejfie
    // (current konfliktu). Jedyna zmiana w treści edytora: te trzy instrukcje i dwa komentarze; bramka dostępu
    // i zapis bez zmian. Działanie: tests/unit/konflikt-edycji-notatki-chwila.test.mjs, tests/e2e/edytor-notatki-rata3.spec.mjs.
    // Odświeżony świadomie 2026-11-17 (E3-PR0b2b, P-NOTATKA-POZNIEJSZA): edytor pamięta całą otwartą wersję (QbaseN)
    // i wysyła ją jako baseNote obok baseUpdatedAtISO, a „Nadpisz moją wersją” podnosi ją do current konfliktu; baner
    // o zmianie z innego urządzenia pokazuje się tylko, gdy wersja w sejfie różni się od otwartej (Qshow czyta ją
    // i porównuje polami odczytu, Qpokaz — dawna treść banera). Jedyna zmiana w treści edytora: te instrukcje, trzy małe
    // funkcje przy banerze i komentarz; bramka dostępu i zapis bez zmian. Działanie: tests/unit/notatka-pozniejsza-zapis.test.mjs.
    const currentEditor = source.slice(...body.range);
    const legacyEditor = reverseEncounterNoteEditorHooks(currentEditor);
    expect(applyEncounterNoteEditorHooks(legacyEditor)).toBe(currentEditor);
    expect(createHash('sha256').update(legacyEditor).digest('hex')).toBe('60dd540af147f7b4c2fec361bdf6758e899c66b4e20a6b87714061ac2399183d');
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
