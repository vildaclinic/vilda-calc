import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../../przelicznik-jednostek.html', import.meta.url), 'utf8');
// E2 now reuses this same treatment-only veto. Keep every existing FSH
// isolation/restore assertion against the actual shared production function.
const start = html.indexOf('    function lifespanAnonymousMainTreatment(');
const end = html.indexOf('    function updateLifespan(', start);
if (start < 0 || end < 0) throw new Error('Production FSH anonymous treatment adapter missing');
const production = html.slice(start, end);
const source = extra => ({ sourceStatus: 'ready', identityKey: '', ...extra });
const input = extra => ({ sex: 'F', contextBasis: 'current-patient', sampleDateISO: null, ...extra });

function adapter({ identity = '', persistence } = {}) {
  return vm.runInNewContext(production + '\nlifespanAnonymousMainTreatment;', {
    currentPatientIdentity: () => identity, persistence,
  });
}
function shared(status) { return { _vildaPersist: { byId: { pubertyGnrhaStatus: status } } }; }

describe('FSH source card — current anonymous main-form treatment exclusion', () => {
  it('reads the existing anonymous mirror as a positive exclusion only, without changing it', () => {
    const mirror = shared('w-trakcie');
    Object.freeze(mirror._vildaPersist.byId);
    const before = JSON.stringify(mirror);
    const evaluate = adapter({ persistence: { readShared: () => mirror } });
    expect(evaluate(source(), input())).toBe(true);
    expect(JSON.stringify(mirror)).toBe(before);
    for (const status of [undefined, null, '', 'brak', 'zakonczone', 'unknown', true, 'yes', 'W-TRAKCIE']) {
      expect(adapter({ persistence: { readShared: () => shared(status) } })(source(), input())).toBe(false);
    }
  });

  it('never reads an anonymous mirror for a selected, changed, loading or unavailable patient', () => {
    let reads = 0;
    const persistence = { readShared: () => { reads++; return shared('w-trakcie'); } };
    for (const [identity, context] of [
      ['fictional-patient-a', source({ identityKey: 'fictional-patient-a' })],
      ['fictional-patient-b', source()],
      ['', source({ identityKey: 'fictional-patient-a' })],
      ['', source({ identityKey: undefined })],
      ['', source({ sourceStatus: 'loading' })],
      ['', source({ sourceStatus: 'unavailable' })],
      ['', null],
    ]) expect(adapter({ identity, persistence })(context, input())).toBe(false);
    expect(reads).toBe(0);
  });

  it('does not attach a current main-form fact to another sex or historical/unspecified sample context', () => {
    let reads = 0;
    const evaluate = adapter({ persistence: { readShared: () => { reads++; return shared('w-trakcie'); } } });
    for (const sample of [null, input({ sex: 'M' }), input({ sex: null }),
      input({ contextBasis: undefined }), input({ contextBasis: 'sample' }),
      input({ sampleDateISO: '2025-04-03' })]) expect(evaluate(source(), sample)).toBe(false);
    expect(reads).toBe(0);
  });

  it('keeps a live carrier authoritative over an older autosave mirror, including explicit blank/no', () => {
    let reads = 0;
    const evaluate = adapter({ persistence: { readShared: () => { reads++; return shared('w-trakcie'); } } });
    for (const status of [null, '', 'brak', 'zakonczone', 'w-trakcie']) {
      expect(evaluate(source({ pubertyAssessmentContext: { available: true, preparing: false,
        puberty: { gnrhaStatus: status } } }), input())).toBe(false);
    }
    expect(evaluate(source({ pubertyAssessmentContext: { available: true, preparing: true } }), input())).toBe(true);
    expect(reads).toBe(0);
  });

  it('withholds during restore/clear and otherwise treats an absent or unreadable mirror as unknown', () => {
    for (const name of ['isClearInProgress', 'isRestoring']) {
      let reads = 0;
      const evaluate = adapter({ persistence: { [name]: () => true,
        readShared: () => { reads++; return shared('w-trakcie'); } } });
      expect(evaluate(source(), input())).toBe(true);
      expect(reads).toBe(0);
    }
    for (const persistence of [undefined, {}, { readShared: () => null }, { readShared: () => ({}) },
      { readShared: () => { throw new Error('Fikcyjny brak sesji'); } }]) {
      expect(adapter({ persistence })(source(), input())).toBe(false);
    }
  });
});
