import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
const require = createRequire(import.meta.url);
const createHistory = require('../../clcr_tmp_gfr_history.js');

function setup() {
  let patient = 'fictional-a', unlocked = true;
  const reads = [], queued = [], listeners = {};
  const root = {
    document: { readyState: 'complete', addEventListener: (name, callback) => { listeners[name] = callback; },
      getElementById: () => ({ value: 'TMP_GFR' }) },
    setTimeout: callback => queued.push(callback), update: vi.fn(),
    ClcrVisitSave: { resolveCurrentPatientId: () => patient, vaultUnlocked: () => unlocked,
      readTmpGfrHistory: id => new Promise((resolve, reject) => { reads.push({ id, resolve, reject }); }) },
    ClcrTmpGfrPersistence: { getPreviousComparison: vi.fn(notes => ({ previous: notes[0] || null, reason: notes.length ? null : 'no-earlier-result' })) },
  };
  return { root, reads, listeners, api: createHistory(root), setPatient: value => { patient = value; },
    setUnlocked: value => { unlocked = value; }, flush: async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); },
    render: () => { while (queued.length) queued.shift()(); } };
}
const current = { burosumab: true, clinicalDate: '2026-10-26' };

describe('TmP/GFR: izolacja porównania z historią pacjenta', () => {
  it('nie czyta historii przy wyłączonym monitorowaniu ani zamkniętym sejfie', async () => {
    const state = setup();
    expect(state.api.comparison({ burosumab: false })).toEqual({});
    state.setUnlocked(false);
    expect(state.api.comparison(current).comparisonReason).toBe('patient-unavailable');
    await state.flush();
    expect(state.reads).toHaveLength(0);
  });

  it('odrzuca spóźnioną historię innego pacjenta i zachowuje rzeczywisty stan ładowania', async () => {
    const state = setup();
    expect(state.api.comparison(current).comparisonReason).toBe('history-loading');
    await state.flush();
    state.setPatient('fictional-b');
    expect(state.api.comparison(current).comparisonReason).toBe('history-loading');
    await state.flush();
    state.reads[0].resolve([{ id: 'old-patient' }]);
    await state.flush();
    expect(state.api.comparison(current).comparisonReason).toBe('history-loading');
    state.reads[1].resolve([{ id: 'correct-patient' }]);
    await state.flush();
    expect(state.api.comparison(current)).toEqual({ previous: { id: 'correct-patient' }, comparisonReason: null });
    expect(state.root.ClcrTmpGfrPersistence.getPreviousComparison).toHaveBeenLastCalledWith(
      [{ id: 'correct-patient' }], current, { patientId: 'fictional-b', clinicalDateISO: '2026-10-26' });
  });

  it('odróżnia błąd od pustej historii i ponawia dopiero po zmianie danych', async () => {
    const state = setup();
    state.api.comparison(current);
    await state.flush();
    state.reads[0].reject(new Error('synthetic read failure'));
    await state.flush();
    expect(state.api.comparison(current).comparisonReason).toBe('history-unavailable');
    expect(state.reads).toHaveLength(1);
    state.api.invalidate();
    expect(state.api.comparison(current).comparisonReason).toBe('history-loading');
    await state.flush();
    state.reads[1].resolve([]);
    await state.flush();
    expect(state.api.comparison(current).comparisonReason).toBe('no-earlier-result');
  });

  it('czyści historię i odrzuca odpowiedź po zablokowaniu sejfu', async () => {
    const state = setup();
    state.api.comparison(current);
    await state.flush();
    state.setUnlocked(false);
    state.api.invalidate();
    state.reads[0].resolve([{ id: 'private-stale' }]);
    await state.flush();
    expect(state.api.comparison(current).comparisonReason).toBe('patient-unavailable');
    expect(state.root.ClcrTmpGfrPersistence.getPreviousComparison).not.toHaveBeenCalled();
    state.setUnlocked(true);
    expect(state.api.comparison(current).comparisonReason).toBe('history-loading');
  });
});
