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
  return { shared, payload, read, source: w.VildaPubertySource, ui: w.VildaLabPubertyUI };
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
