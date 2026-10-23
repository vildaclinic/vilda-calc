import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const g = {};
loadBrowserScript('clcr_clinical_safety.js', g);
const compute = g.ClcrClinicalSafety.computeTimedCreatinineClearance;
const input = {
  protocolMode: 'assumed-complete', urineCreatinineMgDl: 100,
  serumCreatinineMgDl: 1, volumeMl: 1440, durationMinutes: 1440,
};

describe('CL24 — rzeczywisty czas i jawne założenie pełnej zbiórki', () => {
  it('cztery wartości dają wynik bez wieku, BSA, dat i potwierdzeń', () => {
    expect(compute(input)).toMatchObject({ ok: true, absoluteMlMin: 100,
      durationHours: 24, durationMinutes: 1440, indexedMlMin173: null,
      creatinineMgDay: 1440, creatinineMgKgDay: null });
  });
  it.each([[750, 192], [1410, 102.12765957446808], [1440.5, 99.9652898299202]])(
    'używa dokładnie %s minut, bez domyślnej doby i bez zaokrąglania czasu', (minutes, expected) => {
      const result = compute({ ...input, durationMinutes: minutes });
      expect(result.ok).toBe(true);
      expect(result.absoluteMlMin).toBeCloseTo(expected, 10);
      expect(result.durationMinutes).toBe(minutes);
      expect(result.durationHours).toBe(minutes / 60);
    },
  );
  it.each(['urineCreatinineMgDl', 'serumCreatinineMgDl', 'volumeMl', 'durationMinutes'])(
    'brak dodatniego %s nie daje wyniku', (key) => {
      for (const value of [null, undefined, '', 0, -1, NaN, Infinity]) {
        expect(compute({ ...input, [key]: value }).ok).toBe(false);
      }
    },
  );
  it.each(['startVoidDiscarded', 'finalVoidIncluded', 'noMissedVoids', 'noSpillage', 'noExtraVoids', 'storageFollowed'])(
    'zapisany problem %s wygrywa z założeniem', (key) => {
      const result = compute({ ...input, protocol: { [key]: false } });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/niepełną lub błędną/);
    },
  );
  it('jawne zgłoszenie problemu blokuje także bez dawnego protokołu', () => {
    expect(compute({ ...input, collectionProblem: true }).ok).toBe(false);
  });
  it('sam fakt pobrania krwi poza przedziałem zbiórki nie oznacza błędnej zbiórki', () => {
    expect(compute({ ...input, protocol: { serumSampleDuringCollection: false } }).absoluteMlMin).toBe(100);
  });
  it('tryb godzinowy nie odtwarza wyczyszczonego czasu ze starych dat', () => {
    expect(compute({ ...input, durationMinutes: '', collectionStartAt: '2026-10-20T08:00',
      collectionEndAt: '2026-10-21T08:00' }).ok).toBe(false);
  });
  it('dawny interfejs zachowuje wymaganie jego protokołu', () => {
    const legacy = { ...input };
    delete legacy.protocolMode;
    expect(compute(legacy).ok).toBe(false);
  });
  it('dodatkowe BSA i masa nie zmieniają podstawowego klirensu', () => {
    const result = compute({ ...input, bsaM2: 1.8481430181213463, weightKg: 70 });
    expect(result.absoluteMlMin).toBe(100);
    expect(result.indexedMlMin173).toBeCloseTo(93.60747426130258, 10);
    expect(result.creatinineMgKgDay).toBeCloseTo(20.571428571428573, 10);
  });
});

// Execute the actual readable migration functions preceding the existing IIFE.
const migrationSource = readFileSync(new URL('../../inline_kalkulator_klirens_07.js', import.meta.url), 'utf8').split('(function(){const b=')[0];
function migration() {
  const controls = {};
  const context = { window: {}, document: { getElementById: id => controls[id] || null } };
  vm.createContext(context);
  vm.runInContext(migrationSource, context);
  return { normalize: context.normalizeCl24SessionInputs, clear: context.clearCl24InputContext, controls };
}
const dates = { collectionStartAt: '2026-10-20T08:00', collectionEndAt: '2026-10-20T20:30' };
describe('CL24 — jawne założenie metody nie zastępuje zapisanych faktów', () => {
  const source = readFileSync(new URL('../../inline_kalkulator_klirens_04.js', import.meta.url), 'utf8');
  const context = {};
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function clcrMeasuredAssayAssumption('),
    source.indexOf('function resolveClcrCalculationAssumptions(')), context);
  it.each(['', 'not_idms'])('brak potwierdzonej metody (%s) daje opisane założenie IDMS', assay => {
    expect(context.clcrMeasuredAssayAssumption(assay)).toMatchObject({ provenance: 'assumed', standardization: 'IDMS' });
    expect(context.clcrMeasuredAssayAssumption(assay).text).toContain('Przyjęto');
  });
  it.each(['enzymatic_idms', 'jaffe_idms'])('zachowuje potwierdzoną metodę %s', assay => {
    expect(context.clcrMeasuredAssayAssumption(assay)).toMatchObject({ provenance: 'provided', standardization: 'IDMS' });
  });
  it.each(['non_idms', 'enzymatic_non_idms', 'jaffe_non_idms'])('nie nadpisuje przeciwnej informacji %s', assay => {
    const result = context.clcrMeasuredAssayAssumption(assay);
    expect(result).toMatchObject({ provenance: 'provided', standardization: 'non_IDMS' });
    expect(result.text).toContain('bez standaryzacji IDMS');
    expect(result.text).not.toContain('Przyjęto');
  });
});
describe('CL24 — zgodność zapisów i izolacja czasu między pacjentami', () => {
  it('dawne daty przepisuje na rzeczywiste godziny bez utraty źródłowych danych', () => {
    const original = { ...dates, ui_collectionNoMissedVoids_answer: 'no' };
    const session = { inputs: original };
    migration().normalize(session);
    expect(session.inputs).toMatchObject({ ...dates, Cl24DurationHours: '12.5',
      Cl24DurationSource: 'legacy-dates', ui_collectionNoMissedVoids_answer: 'no' });
    expect(original).not.toHaveProperty('Cl24DurationHours');
  });
  it.each(['', '0', '13.5'])(
    'nowy jawny czas %s wygrywa z datami i poprzednią zachowaną wartością', (value) => {
      const session = { preservedInputs: { Cl24DurationHours: '24' }, inputs: { ...dates, Cl24DurationHours: value } };
      migration().normalize(session);
      expect(session.inputs.Cl24DurationHours).toBe(value);
      expect(session.inputs.Cl24DurationSource).toBe(value === '' ? '' : 'hours');
    },
  );
  it('niepełne lub błędne daty nie stają się domyślną dobą', () => {
    for (const bad of [{}, { collectionStartAt: dates.collectionStartAt },
      { collectionStartAt: 'invalid', collectionEndAt: dates.collectionEndAt },
      { collectionStartAt: dates.collectionEndAt, collectionEndAt: dates.collectionStartAt }]) {
      const session = { inputs: bad };
      migration().normalize(session);
      expect(session.inputs.Cl24DurationHours).toBe('');
      expect(session.inputs.Cl24DurationSource).toBe('');
    }
  });
  it('stare false bez odpowiedzi nie zamienia się w zgłoszony problem', () => {
    const session = { inputs: { collectionNoMissedVoids: false } };
    migration().normalize(session);
    expect(session.inputs.Cl24CollectionProblem).toBe(false);
    expect(session.inputs.ui_collectionNoMissedVoids_answer).toBe('');
  });
  it('brak nowego pola w następnej karcie usuwa stan poprzedniego problemu', () => {
    const session = { inputs: { Scr: '1' } };
    migration().normalize(session);
    expect(session.inputs.Cl24CollectionProblem).toBe(false);
    expect(session.inputs.ui_collectionNoMissedVoids_answer).toBe('');
  });
  it('brak sesji czyści czas, pochodzenie i znane problemy poprzedniej osoby', () => {
    const { clear, controls } = migration();
    controls.Cl24DurationHours = { value: '24' };
    controls.Cl24DurationSource = { value: 'legacy-dates' };
    controls.Cl24CollectionProblem = { checked: true };
    controls.ui_collectionNoMissedVoids_answer = { value: 'no' };
    clear();
    expect(controls.Cl24DurationHours.value).toBe('');
    expect(controls.Cl24DurationSource.value).toBe('');
    expect(controls.Cl24CollectionProblem.checked).toBe(false);
    expect(controls.ui_collectionNoMissedVoids_answer.value).toBe('');
  });
});
