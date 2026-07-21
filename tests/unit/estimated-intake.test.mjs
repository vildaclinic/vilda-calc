import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function loadEstimatedIntake() {
  return loadBrowserScript('vilda_estimated_intake.js').VildaEstimatedIntake;
}

const modelDependencies = {
  energyIsNumeric: Number.isFinite,
  getIntakeRowHeight: (row, fallbackHeight) => row.height || fallbackHeight,
  energyBuildIntakeObservedState: ({ weightKg }) => ({
    teeRawKcal: 1000 + weightKg * 20,
    teeBaselineKcal: 1000 + weightKg * 20,
    palUsed: 1.4,
    modeBadge: 'test'
  }),
  buildIntakeIntervals: () => []
};

describe('VildaEstimatedIntake — czysty model', () => {
  it('dla braku pomiarów zwraca plan wyczyszczenia bez efektów ubocznych', () => {
    const result = loadEstimatedIntake().buildEstimatedIntakeCalculationModel(
      { basics: { sex: 'F', height: 130 }, rows: [] },
      {},
      modelDependencies
    );

    expect(result.branch).toBe('empty-rows-message');
    expect(result.commitPlan).toEqual({ action: 'clear', rows: [], intakeKcalPerDay: null });
    expect(result.pureModel).toBe(true);
    expect(result.mutatesDom).toBe(false);
    expect(result.mutatesWindowState).toBe(false);
  });

  it('dla pojedynczego pomiaru wyznacza energię podtrzymującą', () => {
    const row = { ageYears: 10, ageMonths: 120, months: 120, height: 140, weight: 35 };
    const result = loadEstimatedIntake().buildEstimatedIntakeCalculationModel(
      { basics: { sex: 'M', height: 140 }, rows: [row], pal: 1.4 },
      {},
      modelDependencies
    );

    expect(result.branch).toBe('single-row-maintenance');
    expect(result.single.maintenanceKcal).toBe(1700);
    expect(result.single.rowHeight).toBe(140);
    expect(result.commitPlan.action).toBe('set');
    expect(result.postRenderRiskPlan.shouldRun).toBe(true);
  });

  it('kopiuje wiersze bez zmiany ich kolejności i danych wejściowych', () => {
    const rows = [
      { ageYears: 11, ageMonths: 132, months: 132, height: 146, weight: 39 },
      { ageYears: 10, ageMonths: 120, months: 120, height: 140, weight: 35 }
    ];
    const original = structuredClone(rows);
    const result = loadEstimatedIntake().buildEstimatedIntakeCalculationModel(
      { basics: { sex: 'M', height: 146 }, rows, pal: 1.4 },
      {},
      modelDependencies
    );

    expect(result.rows.map((row) => row.months)).toEqual([132, 120]);
    expect(result.rows).not.toBe(rows);
    expect(rows).toEqual(original);
  });
});
