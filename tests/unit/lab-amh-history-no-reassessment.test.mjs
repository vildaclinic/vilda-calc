import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const auth = readFileSync(new URL('../../vilda_auth_ui.js', import.meta.url), 'utf8');
const start = auth.indexOf('function Dl('), end = auth.indexOf('function gi(', start);
if (start < 0 || end < start) throw new Error('Missing production historical laboratory helpers');
const productionHelpers = auth.slice(start, end);
const hooks = converter => new Function('i', `${productionHelpers}; return { range:vi, flag:mi };`)({ LabUnitConverter: converter });
const historicalPoint = (extra = {}) => ({
  noteId: 'fictional-amh-history', dateISO: '2024-01-02', ageMonths: 360,
  v: 2, unit: 'ng/mL', norm: null, ...extra,
});

describe('AMH history retains results without applying current laboratory references', () => {
  it.each(['F', 'M', null])('does not infer current ranges or context for stored AMH, sex %s', sex => {
    const evaluate = vi.fn(() => { throw new Error('Historical AMH must not use today\'s engine'); });
    const history = hooks({ evaluate }), point = historicalPoint();
    const before = structuredClone(point);
    expect(history.range('amh', point.v, point.unit, sex, point.ageMonths, point)).toBeNull();
    expect(history.flag(point, null)).toBeNull();
    expect(evaluate).not.toHaveBeenCalled();
    expect(point).toEqual(before);
    expect(point).not.toHaveProperty('assessment');
  });

  it('the shared history gate also covers a newly pinned AMH without a snapshot', () => {
    const evaluate = vi.fn(() => ({ ok: true, matched: true, is_default: false,
      lowInUnit: 3, highInUnit: 4, status: 'below' }));
    const history = hooks({ evaluate }), point = historicalPoint({ dateISO: '2026-10-13' });
    expect(history.range('amh', point.v, point.unit, 'F', point.ageMonths, point)).toBeNull();
    expect(history.flag(point, null)).toBeNull();
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('preserves explicitly saved lab.norm and numeric values rather than manufacturing an unavailable snapshot', () => {
    const evaluate = vi.fn(), history = hooks({ evaluate });
    for (const [v, flag] of [[.5, '↓'], [2, null], [11, '↑']]) {
      const point = historicalPoint({ v, norm: '1–10 ng/mL' });
      expect(history.range('amh', point.v, point.unit, 'F', point.ageMonths, point)).toBeNull();
      expect(history.flag(point, null)).toBe(flag);
      expect(point.v).toBe(v);
      expect(point.norm).toBe('1–10 ng/mL');
      expect(point).not.toHaveProperty('assessment');
    }
    expect(evaluate).not.toHaveBeenCalled();
  });

  it.each(['lh', 'fsh', 'inhibin_b', 'testosterone_total'])('does not change the existing legacy path for %s', testKey => {
    const evaluate = vi.fn(() => ({ ok: true, matched: true, is_default: false,
      lowInUnit: 1, highInUnit: 4, status: 'above', context_pl: 'Fikcyjny zakres testowy', source_ids: ['fictional-source'] }));
    const history = hooks({ evaluate }), point = historicalPoint({ v: 5, ageMonths: 120, unit: 'test-unit' });
    const range = history.range(testKey, point.v, point.unit, 'M', point.ageMonths, point);
    expect(evaluate).toHaveBeenCalledExactlyOnceWith(testKey, {
      value: 5, unit: 'test-unit', patient: { sex: 'M', age: 10, life_stage: 'pediatric' },
    });
    expect(range).toEqual({ lo: 1, hi: 4, status: 'above', ctx: 'Fikcyjny zakres testowy', src: 'fictional-source' });
    expect(history.flag(point, range)).toBe('↑');
  });

  it('continues to leave an explicit saved assessment to the snapshot renderer', () => {
    const evaluate = vi.fn(), history = hooks({ evaluate });
    const point = historicalPoint({ assessment: { schemaVersion: 1, status: 'unavailable', reasonCodes: ['test'], evaluation: null } });
    for (const analyte of ['amh', 'lh', 'fsh', 'inhibin_b']) {
      expect(history.range(analyte, point.v, point.unit, 'F', point.ageMonths, point)).toBeNull();
      expect(history.flag(point, { status: 'above' })).toBeNull();
    }
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('round-trips legacy and newly pinned AMH through the real vault and numerical series unchanged', async () => {
    const storage = () => {
      const map = new Map();
      return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)),
        removeItem: key => map.delete(key), key: index => [...map.keys()][index] ?? null, get length() { return map.size; } };
    };
    const win = {
      crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
      localStorage: storage(), sessionStorage: storage(), setTimeout, clearTimeout,
      addEventListener() {}, removeEventListener() {}, document: { addEventListener() {}, removeEventListener() {}, hidden: false },
    };
    win.window = win; win.self = win; win.top = win;
    for (const file of ['vilda_crypto.js', 'vilda_lab_snapshot.js', 'vilda_vault.js']) loadBrowserScript(file, win);
    const vault = win.VildaVault;
    vault.setStorageAdapter(vault.createInMemoryAdapter());
    await vault.createUser('Fikcyjny#AMHhistory!2026', { label: 'Fikcyjny sejf AMH', iterations: 10000 });
    const { patientId } = await vault.savePatient({ name: 'Fikcyjna historia AMH', user: { sex: 'F', age: 30, height: 165, weight: 60 } });
    const labs = [
      { test: 'AMH', testKey: 'amh', value: '2 ng/mL', norm: '1–10 ng/mL' },
      { test: 'AMH', testKey: 'amh', value: '3 ng/mL = 21,4 pmol/L', valueNum: 3, unit: 'ng/mL' },
    ];
    for (const [index, labResult] of labs.entries()) {
      const saved = await vault.savePatientNote({ patientId, title: 'Fikcyjne AMH', category: 'wynik-badania',
        clinicalDateISO: `202${index + 4}-01-02`, linkedAgeMonths: 360 + index * 12, labResult });
      expect((await vault.getPatientNote(saved.id)).labResult).toEqual(labResult);
    }
    const series = await vault.listPatientLabSeries(patientId);
    expect(series).toHaveLength(1);
    expect(series[0].testKey).toBe('amh');
    expect(series[0].points.map(p => ({ value: p.valueNum, unit: p.unit, norm: p.norm, age: p.ageMonths })))
      .toEqual([{ value: 2, unit: 'ng/mL', norm: '1–10 ng/mL', age: 360 }, { value: 3, unit: 'ng/mL', norm: null, age: 372 }]);
    for (const point of series[0].points) expect(point).not.toHaveProperty('assessment');
  });
});
