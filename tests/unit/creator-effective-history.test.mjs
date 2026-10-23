import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Wyłącznie fikcyjne dane. Podstawowa historia ma pomiar, którego karta
// zaawansowana nie ma. Silnik norm nie jest podmieniany ani kopiowany.
function prepare() {
  const advanced = { measurements: [], currentAgeMonths: 144, currentHeight: 156, currentWeight: 41 };
  const effective = {
    measurements: [{ ageMonths: 120, height: 140, weight: 32 }],
    currentAgeMonths: 144, currentHeight: 156, currentWeight: 41,
    sourceModule: 'basicGrowth'
  };
  const win = { advancedGrowthData: advanced, getEffectiveCentileGrowthDataState: () => effective };
  loadBrowserScript('vilda_publication_creator.js', win);
  const pc = win.VildaPublicationCreator;
  pc._setContext('olaf');
  pc._regRoot().shared.a120 = { txt: 'Kontrola z historii podstawowej' };
  return { win, pc, advanced, effective };
}

describe('Kreator — wspólne adnotacje używają efektywnej historii pomiarów', () => {
  it('adnotacja punktu historii podstawowej jest widoczna na OLAF i Palczewskiej', () => {
    const { pc, advanced } = prepare();
    for (const source of ['olaf', 'palRegular']) {
      const adv = pc._advForContext(advanced, source);
      expect(pc._collectArrows(adv, 'height')).toMatchObject([
        { key: 'a120', ageMonths: 120, value: 140, comment: 'Kontrola z historii podstawowej' }
      ]);
      expect(pc._collectArrows(adv, 'weight')).toMatchObject([
        { key: 'a120', ageMonths: 120, value: 32 }
      ]);
    }
    expect(advanced.measurements).toEqual([]);
  });

  it('adnotacje podążają za edycją pomiaru efektywnego, bez utrwalania kopii wartości', () => {
    const { pc, advanced, effective } = prepare();
    pc._advForContext(advanced, 'olaf');
    effective.measurements[0].height = 142;
    effective.measurements[0].weight = 33;
    const pal = pc._advForContext(advanced, 'palRegular');
    expect(pc._collectArrows(pal, 'height')[0].value).toBe(142);
    expect(pc._collectArrows(pal, 'weight')[0].value).toBe(33);
    expect(advanced.measurements).toEqual([]);
  });

  it('WHO, niemowlęca Palczewska i publikacja zachowują dotychczasowe wejście', () => {
    const { win, pc, advanced } = prepare();
    let calls = 0;
    win.getEffectiveCentileGrowthDataState = () => { calls += 1; return { measurements: [{ ageMonths: 120, height: 199, weight: 99 }] }; };
    for (const source of ['who', 'palInfant']) {
      const adv = pc._advForContext(advanced, source);
      expect(adv.measurements).toBe(advanced.measurements);
      expect(pc._collectArrows(adv, 'height')).toEqual([]);
    }
    expect(pc._advForContext(advanced, 'pub')).toBe(advanced);
    expect(calls).toBe(0);
  });

  it('jawnie przekazany stan źródła nie jest zastępowany ponownym odczytem globalu', () => {
    const { win, pc, advanced } = prepare();
    const explicit = { ...advanced, measurements: [{ ageMonths: 120, height: 145, weight: 35 }] };
    let calls = 0;
    win.getEffectiveCentileGrowthDataState = () => { calls += 1; return { measurements: [{ ageMonths: 120, height: 199, weight: 99 }] }; };
    const adv = pc._advForContext(explicit, 'palRegular');
    expect(pc._collectArrows(adv, 'height')[0].value).toBe(145);
    expect(pc._collectArrows(adv, 'weight')[0].value).toBe(35);
    expect(calls).toBe(0);
  });

  it('zmiana samej historii podstawowej unieważnia geometrię używaną do migracji starszej ramki', () => {
    const { win, pc, advanced, effective } = prepare();
    win.basicGrowthData = { measurements: effective.measurements };
    const free = { id: 1, ageMonths: 144, value: 156, txt: 'Ramka historii', arrow: false, dx: 100, dy: -20 };
    win.chartCreatorData = { olaf: { free: { height: [{ ...free }], weight: [] } } };
    const ctx = { save() {}, restore() {}, measureText(text) { return { width: String(text).length * 20 }; } };
    const oldSource = { plotX: 220, plotY: 300, plotW: 1800, plotH: 900, ageMin: 36, ageMax: 216, minY: 70, maxY: 190 };
    const newSource = { ...oldSource, minY: 50, maxY: 210, plotH: 1200 };
    const target = { plotX: 160, plotY: 210, plotW: 2040, plotH: 2600, ageMin: 12, ageMax: 216, minY: 60, maxY: 210 };
    function register(geom) {
      pc._setSuppress(true);
      try { pc.drawAnnotations(ctx, { ctxId: 'olaf', chartType: 'height', ...geom }); }
      finally { pc._setSuppress(false); }
    }
    register(oldSource);
    win.basicGrowthData.measurements = [{ ageMonths: 120, height: 140, weight: 32 }, { ageMonths: 144, height: 200, weight: 50 }];
    effective.measurements = win.basicGrowthData.measurements;
    const targetItems = () => pc._computeLayout(ctx, pc._advForContext(advanced, 'palRegular'), 'height', target);
    targetItems();
    const entry = win.chartCreatorData.growth.free.height[0];
    expect(entry.frame, 'stary zakres nie może zostać utrwalony jako położenie danych').toBeUndefined();
    expect(entry.legacyPos).toEqual({ context: 'olaf', key: 'f1' });
    register(newSource);
    targetItems();
    const original = pc._computeLayout(ctx, { ...effective, pubFree: { height: [{ ...free }], weight: [] } }, 'height', newSource)[0];
    const projected = pc._computeLayout(ctx, { measurements: [], pubFree: { height: [{ id: 'probe', ...entry.frame, arrow: false }], weight: [] } }, 'height', newSource)[0];
    expect(original.x + original.w / 2).toBeCloseTo(projected.px, 6);
    expect(original.y + original.h / 2).toBeCloseTo(projected.py, 6);
    expect(advanced.measurements).toEqual([]);
  });
});
