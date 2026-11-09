import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
const source = readFileSync(new URL('../../vilda_chrome.js', import.meta.url), 'utf8');
const refresh = source.slice(source.indexOf('function Ch_refreshSync('), source.indexOf('function Ch_bindVault('));
function render(state, { owner = true, offline = false } = {}) {
  const doc = atrapaDokumentu(), button = doc.createElement('button'), menu = doc.createElement('button'), label = doc.createElement('span');
  doc.querySelectorAll = selector => doc.body.querySelectorAll(selector);
  button.id = 'vildaSyncBtn'; button.classList.add('is-enabled'); button.setAttribute('data-sync-state', 'idle');
  menu.setAttribute('data-menu-sync', ''); label.setAttribute('data-menu-sync-label', ''); menu.appendChild(label); doc.body.appendChild(button); doc.body.appendChild(menu);
  vm.runInNewContext(refresh + '\nCh_refreshSync();', { o: doc, r: { navigator: { onLine: !offline } },
    Cm_menuOwner: () => owner, Ch_syncStatus: state, Ch_attr: (element, key, value) => element.setAttribute(key, String(value)) });
  return { label: label.textContent, warning: button.getAttribute('data-header-sync-warning'), state: menu.getAttribute('data-sync-state') };
}
describe('workspace sync presentation', () => {
  it('never presents locally pending changes as synchronized', () => {
    expect(render('pending')).toEqual({ label: 'Zmiany oczekują na synchronizację', warning: 'false', state: 'pending' });
  });
  it('exposes a retained conflict and keeps offline precedence', () => {
    expect(render('conflict')).toEqual({ label: 'Zmiany wymagają uzgodnienia', warning: 'true', state: 'conflict' });
    expect(render('conflict', { offline: true }).state).toBe('offline');
  });
  it('clears private status after lock', () => {
    expect(render('conflict', { owner: false })).toEqual({ label: 'Synchronizacja wyłączona', warning: 'false', state: 'disabled' });
  });
});
