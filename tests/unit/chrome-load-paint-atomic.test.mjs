import fs from 'node:fs';
import vm from 'node:vm';
import { expect, it, vi } from 'vitest';
import { funkcjaZ } from '../support/silnik-bmi.mjs';

it('paints status and all patient actions from one native load snapshot, without recursive refresh', () => {
  const source = fs.readFileSync(new URL('../../vilda_chrome.js', import.meta.url), 'utf8');
  const node = () => { const attrs = new Map(); return { disabled: false,
    setAttribute: (key, value) => attrs.set(key, String(value)), removeAttribute: key => attrs.delete(key),
    hasAttribute: key => attrs.has(key), getAttribute: key => attrs.get(key) ?? null, querySelector: () => null }; };
  const status = node(), save = node(), documents = node(), clear = node(), doc = {};
  const loading = { state: 'loading', loading: true, save: null, documents: null, clear: null };
  const read = vi.fn().mockReturnValueOnce(loading).mockReturnValue(null);
  const ctx = vm.createContext({ o: { querySelectorAll: selector => selector === '[data-menu-save-status]' ? [status]
    : selector === '[data-menu-clear]' ? [clear] : selector.includes('saveDataBtnSidebar') ? [save] : [documents] },
    O: false, Ch_saveDocument: doc, Ch_saveContext: () => ({ doc }), Ch_bindSaveSource: () => {},
    Ch_saveSource: () => ({ ready: true, api: { getState: () => 'saved' } }),
    Cm_navigationPresentation: read, Cm_bindClear: () => {}, Cm_clearCurrent: { pending: false },
    Cm_clearContext: () => ({}), Ch_attr: (button, name, value) => button.setAttribute(name, value) });
  vm.runInContext(['Ch_refreshSaveState', 'Cm_refreshClear', 'Cm_refreshNavigationActions', 'Cm_paintPreparation']
    .map(name => funkcjaZ(source, name)).join('\n'), ctx);
  vm.runInContext('Cm_refreshClear()', ctx, { timeout: 1000 });
  expect(read).toHaveBeenCalledOnce();
  expect(status.getAttribute('data-save-state')).toBe('loading');
  for (const control of [save, documents, clear]) expect(control.getAttribute('data-menu-load-pending')).toBe('true');
  expect(clear.disabled).toBe(true);
  vm.runInContext('Ch_refreshSaveState()', ctx, { timeout: 1000 });
  expect(read).toHaveBeenCalledTimes(2);
  expect(status.getAttribute('data-save-state')).toBe('saved');
  for (const control of [save, documents, clear]) expect(control.getAttribute('data-menu-load-pending')).toBeNull();
  expect(clear.disabled).toBe(false);
});
