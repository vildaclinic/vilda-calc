import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

describe('home workspace isolation boundary', () => {
  it.each([undefined, false, 'true', 1])('does not inspect or change the normal app for flag %s', flag => {
    const window = { __VILDA_HOME_WORKSPACE_PREVIEW__: flag };
    Object.defineProperty(window, 'document', { get() { throw new Error('Normal app document must not be touched'); } });
    loadBrowserScript('vilda_home_workspace.js', window);
    loadBrowserScript('vilda_home_perinatal.js', window);
    loadBrowserScript('vilda_home_growth.js', window);
    loadBrowserScript('vilda_home_growth_views.js', window);
    loadBrowserScript('vilda_home_growth_charts.js', window);
    expect(window.VildaHomeWorkspace).toBeUndefined();
    expect(window.VildaHomePerinatal).toBeUndefined();
    expect(window.VildaHomeGrowth).toBeUndefined();
    expect(window.VildaHomeGrowthViews).toBeUndefined();
    expect(window.VildaHomeGrowthCharts).toBeUndefined();
  });

  it('waits for the actual document and remains harmless outside the main form', () => {
    const listen = vi.fn();
    const document = { readyState: 'loading', addEventListener: listen, getElementById: () => null, querySelector: () => null };
    const window = { __VILDA_HOME_WORKSPACE_PREVIEW__: true, document };
    loadBrowserScript('vilda_home_workspace.js', window);
    expect(listen).toHaveBeenCalledWith('DOMContentLoaded', expect.any(Function), { once: true });
    expect(() => listen.mock.calls[0][1]()).not.toThrow();
    expect(() => window.VildaHomeWorkspace.refresh()).not.toThrow();
  });
});
