import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const copy = value => value == null ? value : structuredClone(value);
function events() {
  const listeners = new Map();
  return {
    addEventListener(type, callback) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(callback); },
    dispatchEvent(event) { (listeners.get(event.type) || []).slice().forEach(callback => callback(event)); return true; },
  };
}
function fixture({ absent = false, onlyP = false, anonymous = false, age = 13, ageMonths = 0, ageWeeks = null } = {}) {
  let patientId = anonymous ? null : 'fictional-puberty-a', active = 'lab', activation = 1, open = !anonymous, accountGeneration = 1;
  let writable = true, rejectWrite = false, beforeAuthority = null;
  const reference = { sex: 'M', ageMonths: age === null && !ageMonths && !ageWeeks ? null : (age || 0) * 12 + (ageMonths || 0), measuredAtISO: '2026-06-17' };
  const visit = { version: 1, visitId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', patientId,
    clinicalDateISO: '2026-06-17', createdAtISO: '2026-06-17T12:00:00.000Z', origin: 'explicit' };
  const assessment = { version: 1, sex: 'M', observations: {
    G: onlyP ? null : { stage: 3, sex: 'M', observedAtISO: '2026-06-17', ageMonths: 156, source: 'clinician-entry' },
    Th: null, P: { stage: 1, sex: 'M', observedAtISO: '2026-06-17', ageMonths: 156, source: 'clinician-entry' },
  } };
  const marker = { version: 1, visitId: 'fictional-puberty-visit-a', ownerPatientId: patientId,
    reference, currentAxes: onlyP ? ['P'] : ['G', 'P'] };
  let session = { version: 1, name: 'Fikcyjny Test', visit: copy(visit),
    user: { lastName: 'Fikcyjny', firstName: 'Test', sex: 'M', age, ageMonths, ageWeeks,
      measuredAtISO: '2026-06-17', height: 158, weight: 47,
      ...(!absent ? { pubertyAssessment: copy(assessment), pubertyAssessmentVisit: copy(marker) } : {}) },
    advanced: { untouched: [null, 0, 'fictional'] }, clcr: { untouched: 42 } };
  const writes = [], names = new WeakMap(), shell = { document: { ...events() }, frames: [], VildaShell: {
    captureSessionWriter(view) { return active === names.get(view) && writable ? { view, activation, patientId, accountGeneration } : null; },
    isSessionWriterCurrent(ticket, view) {
      if (beforeAuthority) { const callback = beforeAuthority; beforeAuthority = null; callback(); }
      return ticket.view === view && active === names.get(view) && writable && ticket.activation === activation
        && ticket.patientId === patientId && ticket.accountGeneration === accountGeneration;
    },
  } };
  const storage = { getItem: key => key === 'vildaCurrentPatientId' ? patientId : null };
  function page(name, main) {
    const fields = new Map(Object.entries({ sex: 'M', age: age == null ? '' : String(age),
      ageMonths: ageMonths == null ? '' : String(ageMonths), ageWeeks: ageWeeks == null ? '' : String(ageWeeks) })
      .map(([id, value]) => [id, { id, value }]));
    if (main) fields.set('tannerStageWrap', {});
    const vault = { isUnlocked: () => open, onLock() {}, getCurrentUser: () => open ? { userId: 'fictional-account-a' } : null,
      captureSyncOperationSession: () => accountGeneration,
      assertSyncOperationSession(token) { if (!open || token !== accountGeneration) throw new Error('session replaced'); } };
    const panel = { nieaktualny: () => false, canWriteSession: () => active === name && writable,
      captureWriteAuthority: () => active === name && writable ? { activation, patientId, accountGeneration } : null,
      isWriteAuthorityCurrent: () => false };
    const win = { ...events(), document: { ...events(), getElementById: id => fields.get(id) || null },
      frames: [], parent: shell, top: shell, sessionStorage: storage, VildaVault: vault,
      ...(main ? { VildaPanelPacjent: panel } : {}),
      VildaDobAge: { readMeasuredAtISO: () => reference.measuredAtISO },
      setTimeout: vi.fn(() => 0), clearTimeout() {}, crypto: { randomUUID: () => 'fictional-new-puberty-visit' },
      CustomEvent: class CustomEvent { constructor(type, options) { this.type = type; this.detail = options.detail; } },
      VildaPersistence: { isClearInProgress: () => false, readMainSession: () => copy(session),
        writeMainSession(value) {
          if (rejectWrite || active !== name || !writable) return false;
          writes.push({ name, value: copy(value) }); session = copy(value); return true;
        } },
      VildaSaveStatusIndicator: { reconcileFromSharedReference: vi.fn() } };
    names.set(win, name); shell.frames.push(win);
    loadBrowserScript('vilda_visit_context.js', win);
    win.VildaVisitContext.load(copy(session));
    loadBrowserScript('vilda_puberty_assessment.js', win);
    if (main) loadBrowserScript('vilda_puberty_assessment_state.js', win);
    loadBrowserScript('vilda_puberty_assessment_context.js', win);
    return win;
  }
  const main = page('start', true), lab = page('lab', false);
  main.VildaPubertyAssessmentState.load(copy(session), { restore: true });
  return { main, lab, writes, session: () => copy(session), replaceSession: value => { session = copy(value); },
    rejectWrites: () => { rejectWrite = true; }, revokeWriter: () => { writable = false; },
    changePatient: () => { patientId = 'fictional-puberty-b'; }, changeActivation: () => { activation += 1; },
    lock: () => { open = false; accountGeneration += 1; }, beforeAuthority: callback => { beforeAuthority = callback; } };
}

describe('shared puberty edit — the active panel transports only its current assessment', () => {
  it('persists P1 → P2 through the Lab writer without granting the hidden Start writer authority', () => {
    const h = fixture(), before = h.session();
    expect(h.main.VildaPanelPacjent.canWriteSession()).toBe(false);
    expect(h.lab.VildaPubertyAssessmentContext.editObservation('P', 2)).toEqual({ ok: true });
    const after = h.session();
    expect(after.user.pubertyAssessment.observations.P.stage).toBe(2);
    expect(h.main.VildaPubertyAssessmentState.read().assessment.observations.P.stage).toBe(2);
    expect(after.user.pubertyAssessment.observations.G).toEqual(before.user.pubertyAssessment.observations.G);
    expect(after.user.pubertyAssessmentVisit.visitId).toBe(before.user.pubertyAssessmentVisit.visitId);
    const restored = copy(after);
    restored.user.pubertyAssessment = before.user.pubertyAssessment;
    restored.user.pubertyAssessmentVisit = before.user.pubertyAssessmentVisit;
    expect(restored).toEqual(before);
    expect(h.writes.map(write => write.name)).toEqual(['lab']);
    expect(h.main.VildaPanelPacjent.canWriteSession()).toBe(false);
    expect(h.lab.VildaSaveStatusIndicator.reconcileFromSharedReference).toHaveBeenCalledOnce();
  });

  it('accepts structural equality when serialization ordered the same observation keys differently', () => {
    const h = fixture(), session = h.session();
    const old = session.user.pubertyAssessment.observations.P;
    session.user.pubertyAssessment.observations.P = { source: old.source, ageMonths: old.ageMonths,
      observedAtISO: old.observedAtISO, sex: old.sex, stage: old.stage };
    h.replaceSession(session);
    expect(h.lab.VildaPubertyAssessmentContext.editObservation('P', 2)).toEqual({ ok: true });
  });

  it('creates the first typed assessment only under the same existing encounter', () => {
    const h = fixture({ absent: true });
    expect(h.lab.VildaPubertyAssessmentContext.editObservation('P', 2)).toEqual({ ok: true });
    expect(h.session().user.pubertyAssessment.observations.P.stage).toBe(2);
    expect(h.session().user.pubertyAssessmentVisit.ownerPatientId).toBe('fictional-puberty-a');
  });

  it.each([
    { age: null, ageMonths: 0, expected: null },
    { age: null, ageMonths: null, expected: null },
    { age: 0, ageMonths: 0, expected: 0 },
    { age: null, ageMonths: 0, ageWeeks: 3, expected: 0 },
    { age: null, ageMonths: 4, expected: 4 },
  ])('preserves the production age semantics for $age years / $ageMonths months / $ageWeeks weeks', input => {
    const h = fixture({ absent: true, ...input });
    expect(h.lab.VildaPubertyAssessmentContext.editObservation('P', 2)).toEqual({ ok: true });
    expect(h.session().user.pubertyAssessmentVisit.reference.ageMonths).toBe(input.expected);
  });

  it('rejects a different general encounter even if the puberty marker is unchanged', () => {
    const h = fixture(), session = h.session();
    session.visit.visitId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    h.replaceSession(session);
    expect(h.lab.VildaPubertyAssessmentContext.editObservation('P', 2).ok).toBe(false);
    expect(h.writes).toEqual([]);
  });

  it('preserves an explicit empty last axis rather than restoring the previous P1', () => {
    const h = fixture({ onlyP: true });
    expect(h.lab.VildaPubertyAssessmentContext.editObservation('P', null)).toEqual({ ok: true });
    expect(h.session().user.pubertyAssessment.observations).toEqual({ G: null, Th: null, P: null });
    expect(h.session().user.pubertyAssessmentVisit.currentAxes).toEqual([]);
  });

  it('also transports an anonymous guest examination under the active panel fence', () => {
    const h = fixture({ anonymous: true });
    expect(h.lab.VildaPubertyAssessmentContext.editObservation('P', 2)).toEqual({ ok: true });
    expect(h.session().user.pubertyAssessmentVisit.ownerPatientId).toBeNull();
  });

  it('does not publish a carrier edit or notify consumers when the working-session write is rejected', () => {
    const h = fixture(), before = h.main.VildaPubertyAssessmentState.capture(), changed = vi.fn();
    h.main.VildaPubertyAssessmentState.subscribe(changed);
    h.rejectWrites();
    expect(h.lab.VildaPubertyAssessmentContext.editObservation('P', 2)).toEqual({ ok: false, reason: 'session-write-rejected' });
    expect(h.main.VildaPubertyAssessmentState.capture()).toEqual(before);
    expect(changed).not.toHaveBeenCalled();
    expect(h.writes).toEqual([]);
    expect(h.lab.VildaSaveStatusIndicator.reconcileFromSharedReference).not.toHaveBeenCalled();
  });

  it.each(['writer', 'activation', 'patient', 'account'])('rejects a %s boundary after capturing the projection', boundary => {
    const h = fixture(), before = h.session();
    h.beforeAuthority(() => ({ writer: h.revokeWriter, activation: h.changeActivation,
      patient: h.changePatient, account: h.lock })[boundary]());
    expect(h.lab.VildaPubertyAssessmentContext.editObservation('P', 2).ok).toBe(false);
    expect(h.session()).toEqual(before);
    expect(h.writes).toEqual([]);
  });

  it('rejects a different same-patient encounter and a changed baseline assessment', () => {
    for (const key of ['visit', 'assessment']) {
      const h = fixture(), session = h.session();
      if (key === 'visit') session.user.pubertyAssessmentVisit.visitId = 'fictional-other-visit';
      else session.user.pubertyAssessment.observations.P.stage = 4;
      h.replaceSession(session);
      expect(h.lab.VildaPubertyAssessmentContext.editObservation('P', 2).ok).toBe(false);
      expect(h.writes).toEqual([]);
      expect(h.main.VildaPubertyAssessmentState.read().assessment.observations.P.stage).toBe(1);
    }
  });

  it('does not offer an editable ready visit from an inactive Lab panel', () => {
    const h = fixture(); h.revokeWriter();
    expect(h.lab.VildaPubertyAssessmentContext.readActiveContext()).toMatchObject({ preparing: true, canEditVisit: false });
    expect(h.lab.VildaPubertyAssessmentContext.editObservation('P', 2).ok).toBe(false);
  });
});
