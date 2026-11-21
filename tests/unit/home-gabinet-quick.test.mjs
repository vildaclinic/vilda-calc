import {describe, expect, it, vi} from 'vitest';
import {loadBrowserScript} from '../support/load-browser-script.mjs';

function setup() {
  const win = {
    __VILDA_HOME_WORKSPACE_PREVIEW__: true,
    __VILDA_HOME_GABINET_PREVIEW__: true,
    advHistoryCalcAnthroStatsForSource: vi.fn(() => ({percentile: 42, sd: -0.21})),
    get VildaVault() { throw new Error('The anonymous calculator accessed a patient.'); },
    get document() { throw new Error('The anonymous calculator accessed the patient form.'); },
  };
  loadBrowserScript('vilda_sds_wzrostu.js', win);
  loadBrowserScript('vilda_centile_live_colors.js', win);
  loadBrowserScript('vilda_home_gabinet_quick.js', win);
  return win;
}

describe('Gabinet quick calculation', () => {
  it('is present only in the isolated new homepage', () => {
    expect(loadBrowserScript('vilda_home_gabinet_quick.js', {}).VildaHomeGabinetQuick).toBeUndefined();
    expect(loadBrowserScript('vilda_home_gabinet_quick.js', {__VILDA_HOME_WORKSPACE_PREVIEW__:true}).VildaHomeGabinetQuick).toBeUndefined();
  });

  it.each([
    [0, 0, 'OLAF', null],
    [0, 1, 'OLAF', 'PALCZEWSKA'],
    [2, 11, 'OLAF', 'PALCZEWSKA'],
    [3, 0, 'OLAF', 'OLAF'],
    [17, 11, 'Palczewska', 'PALCZEWSKA'],
  ])('routes age %i years %i months and %s to the explicit native reference', (years, months, reference, source) => {
    const win = setup();
    const result = win.VildaHomeGabinetQuick.calculate({years, months, sex:'F', mass:'17,5', reference});
    if (source) {
      expect(win.advHistoryCalcAnthroStatsForSource).toHaveBeenCalledExactlyOnceWith(17.5, 'F', (years * 12 + months) / 12, 'WT', source);
      expect(result.rows[0]).toMatchObject({key:'weight', percentile:42, sds:-0.21});
    } else {
      expect(win.advHistoryCalcAnthroStatsForSource).not.toHaveBeenCalled();
      expect(result.rows).toEqual([]);
    }
  });

  it('requires both measurements from age 18 and rejects invalid input before calculating', () => {
    const win = setup();
    const calculate = win.VildaHomeGabinetQuick.calculate;
    expect(calculate({years:18, sex:'M', mass:70})).toMatchObject({kind:'adult', errorField:'height'});
    expect(calculate({years:12, months:12, sex:'M', height:150}).errorField).toBe('months');
    expect(calculate({years:12, sex:'M', height:'-12'}).errorField).toBe('height');
    expect(win.advHistoryCalcAnthroStatsForSource).not.toHaveBeenCalled();
  });
});
