import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function loadReferenceData() {
  const browserGlobal = loadBrowserScript('vilda_growth_reference_data.js');
  return browserGlobal.VildaGrowthReferenceData;
}

describe('VildaGrowthReferenceData', () => {
  it('publikuje komplet wymaganych zbiorów bez efektów DOM', () => {
    const api = loadReferenceData();
    const snapshot = api.getSnapshot();

    expect(snapshot.readOnly).toBe(true);
    expect(snapshot.dataOnly).toBe(true);
    expect(snapshot.didRenderDom).toBe(false);
    expect(snapshot.datasets.WFL_DATA_BOYS.count).toBe(131);
    expect(snapshot.datasets.WFL_DATA_GIRLS.count).toBe(131);
    expect(snapshot.datasets.LMS_BOYS.count).toBe(205);
    expect(snapshot.datasets.LMS_GIRLS.count).toBe(205);
    expect(snapshot.datasets.LMS_INFANT_BOYS.count).toBe(61);
    expect(snapshot.datasets.LMS_INFANT_GIRLS.count).toBe(61);
  });

  it('chroni znane punkty referencyjne przed przypadkową zmianą', () => {
    const data = loadReferenceData().getData();

    expect(data.bmiPercentiles.boys['24']).toEqual({ P5: 14.16, P85: 17.4, P95: 18.31 });
    expect(data.bmiPercentiles.girls['24']).toEqual({ P5: 13.72, P85: 17.16, P95: 18.13 });
    expect(data.WFL_DATA_BOYS[0]).toEqual([45, -0.3521, 2.441, 0.09182]);
    expect(data.WFL_DATA_GIRLS.at(-1)).toEqual([110, -0.3833, 18.3324, 0.09401]);
  });

  it('chroni powierzchnię API i zwraca nowy kontener danych', () => {
    const api = loadReferenceData();
    const first = api.getData();
    const second = api.getData();

    expect(Object.isFrozen(api)).toBe(true);
    expect(first).not.toBe(second);
    expect(Object.keys(first)).toEqual(Object.keys(second));
  });
});
