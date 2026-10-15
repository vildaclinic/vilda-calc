import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Wykonujemy rzeczywisty adapter strony, bez kopii reguły przypisania początku.
const html = readFileSync(new URL('../../przelicznik-jednostek.html', import.meta.url), 'utf8');
const start = html.indexOf('    function readPubertyPatientContext() {');
const end = html.indexOf('    var pubertyUI =', start);
if (start < 0 || end <= start) throw new Error('Nie znaleziono produkcyjnego adaptera kontekstu LH/FSH');
const makeReader = new Function('window', 'sessionStorage', 'persistence', 'extractTannerFromAny',
  `${html.slice(start, end)}; return readPubertyPatientContext;`);

function harness({ sourceSex = 'M', currentSex = 'M', saved = true } = {}) {
  const id = saved ? 'fictional-onset-provenance' : '';
  const shared = { sex: currentSex, age: 14, ageMonths: 0, tannerStage: '3',
    puberty: { onsetAgeYears: 6.5 } };
  const payload = { user: { sex: sourceSex, age: 14, tannerStage: '3' },
    puberty: { onsetAgeYears: 6.5 } };
  const storage = { getItem: key => key === 'vildaCurrentPatientId' ? id || null : null };
  const w = {
    sessionStorage: storage, _vildaCurrentPatientId: id,
    document: { readyState: 'loading', getElementById: () => null, addEventListener() {} },
    addEventListener() {}, VildaVault: { isUnlocked: () => true }
  };
  loadBrowserScript('vilda_puberty_source.js', w);
  loadBrowserScript('vilda_lab_puberty_ui.js', w);
  if (saved) w.VildaPubertySource.zapamietaj(payload, id);
  const read = makeReader(w, storage, { readShared: () => shared }, input => Number(input.tannerStage) || null);
  return { w, shared, payload, read, source: w.VildaPubertySource, ui: w.VildaLabPubertyUI };
}

describe('LH/FSH — pochodzenie płci zapisanej historii początku', () => {
  it.each([
    ['M', 'F', 'G'],
    ['F', 'M', 'Th'],
  ])('zmiana bieżącej płci %s → %s nie przepisuje rodzaju początku z rekordu', (sourceSex, changedSex, kind) => {
    const h = harness({ sourceSex, currentSex: sourceSex });
    const before = JSON.stringify(h.payload);
    expect(h.read().onset.kind).toBe(kind);
    h.shared.sex = changedSex;
    const context = h.read();
    expect(context).toMatchObject({ sex: changedSex, onsetReportedYears: 6.5,
      onset: { kind, age: { years: 6, months: null, days: null, precision: 'year' }, confirmedPubertalOnset: false } });
    const input = h.ui.buildInput({ sex: context.sex, contextBasis: 'current-patient',
      onsetKind: context.onset.kind, onsetAgeYears: context.onset.age.years,
      onsetConfirmed: context.onset.confirmedPubertalOnset }, { analyte: 'lh', raw: '2', unit: 'IU/L' });
    expect(input.onset).toEqual({ kind: 'unspecified', dateISO: null, age: null, confirmedPubertalOnset: false });
    expect(JSON.stringify(h.payload)).toBe(before);
  });

  it.each([null, '', 'nieznana'])('brak płci źródłowego rekordu (%j) nie jest uzupełniany płcią z formularza', sourceSex => {
    const h = harness({ sourceSex, currentSex: 'F' });
    expect(h.read()).toMatchObject({ sex: 'F', onset: null, onsetReportedYears: null });
    h.shared.sex = 'M';
    expect(h.read()).toMatchObject({ sex: 'M', onset: null, onsetReportedYears: null });
  });

  it('starszy kontrakt brokera bez sourceSex nie uruchamia domysłu rodzaju początku', () => {
    const h = harness();
    const readSource = h.source.kontekstPacjenta;
    h.source.kontekstPacjenta = id => {
      const context = readSource(id);
      delete context.sourceSex;
      return context;
    };
    expect(h.read()).toMatchObject({ sex: 'M', onset: null, onsetReportedYears: null });
  });

  it('bez wybranego rekordu używa bieżących edytowalnych danych głównego formularza', () => {
    const h = harness({ saved: false, currentSex: 'F' });
    expect(h.read()).toMatchObject({ identityKey: '', sex: 'F', onset: { kind: 'Th' } });
    h.shared.sex = 'M';
    expect(h.read()).toMatchObject({ identityKey: '', sex: 'M', onset: { kind: 'G' } });
    h.shared.sex = '';
    expect(h.read().onset).toBeNull();
  });
});

describe('LH/FSH — aktywna typowana ocena wizyty', () => {
  function active(kind = 'G', stage = 3) {
    return { available: true, scope: 'visit', sex: kind === 'Th' ? 'F' : 'M',
      assessmentContext: { status: 'ready', legacy: null, assessment: { version: 1,
        sex: kind === 'Th' ? 'F' : 'M', observations: { G: null, Th: null, P: null,
          [kind]: { stage, observedAtISO: '2026-10-15', ageMonths: 168, source: 'clinician-entry' } } } },
      gonadal: { kind, stage, current: true, observedAtISO: '2026-10-15', ageMonths: 168, source: 'clinician-entry' },
      puberty: { gnrhaStatus: 'w-trakcie', onsetAgeYears: 9 } };
  }
  it.each([['M', 'G'], ['F', 'Th']])('importuje bieżące %s/%s bez pytania o rodzaj cechy', (sex, kind) => {
    const h = harness({ currentSex: sex });
    h.w.VildaPubertyAssessmentContext = { readActiveContext: () => active(kind) };
    const context = h.read();
    expect(context.gonadalObservation).toMatchObject({ kind, stage: 3, current: true });
    expect(h.ui.sharedObservationFields(context)).toMatchObject({ kind, stage: 3,
      assessedAt: '2026-10-15', pubertyAppliesToCurrentContext: true });
    expect(context.gnrhaStatus).toBe('w-trakcie');
  });
  it('aktywny formularz zachowuje ocenę i znane GnRHa podczas odczytu nowszej głowy rekordu', () => {
    const h = harness();
    h.w.VildaPubertyAssessmentContext = { readActiveContext: () => active() };
    h.source.kontekstPacjenta = id => ({ patientId: id, status: 'loading' });
    const context = h.read();
    expect(context).toMatchObject({ sourceStatus: 'ready', gonadalObservation: { kind: 'G', stage: 3 },
      gnrhaStatus: 'w-trakcie', onset: { kind: 'G', age: { years: 9 } } });
  });
  it('brak potwierdzonej aktywnej wizyty nie omija bramki rekordu', () => {
    const h = harness();
    h.w.VildaPubertyAssessmentContext = { readActiveContext: () => ({ available: false, scope: 'local' }) };
    h.source.kontekstPacjenta = id => ({ patientId: id, status: 'loading' });
    expect(h.read()).toEqual({ identityKey: 'fictional-onset-provenance', sourceStatus: 'loading',
      pubertyAssessmentContext: { available: false, scope: 'local' } });
  });
  it.each(['invalid', 'unsupported'])('obecny %s schemat rekordu bez aktywnej wizyty blokuje fallback do starego numeru', status => {
    const h = harness();
    h.w.VildaPubertyAssessment = { readUser: () => { throw new Error('Legacy fallback must not run'); } };
    h.w.VildaPubertyAssessmentContext = { readActiveContext: () => ({ available: false, scope: 'local',
      assessmentContext: { status: 'absent', assessment: null, legacy: null } }) };
    h.source.kontekstPacjenta = id => ({ patientId: id, status: 'ready',
      assessmentContext: { status, assessment: null, legacy: null } });
    expect(h.read().pubertyAssessmentContext.assessmentContext).toEqual({ status, assessment: null, legacy: null });
  });
  it.each([
    { kind: 'P', stage: 4, current: true },
    { kind: 'unspecified', stage: 4, current: true },
    { kind: 'Th', stage: 3, current: true },
    null,
  ])('P, legacy i niezgodna cecha %j nie stają się G', gonadalObservation => {
    const h = harness();
    expect(h.ui.sharedObservationFields({ sex: 'M', gonadalObservation })).toEqual({ kind: 'unspecified', stage: '',
      assessedAt: null, observationSource: null, pubertyAppliesToCurrentContext: false });
  });
  it('historyczna kwalifikacja nie staje się bieżącą na podstawie samego numeru', () => {
    const h = harness();
    expect(h.ui.sharedObservationFields({ sex: 'M', gonadalObservation: {
      kind: 'G', stage: null, observation: { stage: 3 }, current: false, observedAtISO: '2024-03-02', source: 'clinician-entry' } }))
      .toMatchObject({ kind: 'G', stage: null, assessedAt: '2024-03-02', pubertyAppliesToCurrentContext: false });
  });
});
