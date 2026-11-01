import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const read = file => readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
const chrome = read('vilda_chrome.js');
const start = chrome.indexOf('var d=[{type:"css",href:"vilda_auth_ui.css');
const end = chrome.indexOf('function l(){var f=r.VildaAuthUI', start);
if (start < 0 || end < start) throw new Error('Actual chrome auth loader not found');
const chromeLoader = chrome.slice(start, end);
const bridge = read('vilda_session_bridge.js');

function environment(source) {
  const scripts = [];
  const win = { sessionStorage: { getItem: () => null }, addEventListener() {},
    CustomEvent: class { constructor(type) { this.type = type; } } };
  // All existing dependencies are ready. Only the newly missing protocol is
  // actually loaded, so this exercises both real production loader branches.
  for (const match of source.matchAll(/(?:r|n)\.(Vilda[A-Za-z0-9]+)/g)) win[match[1]] = {};
  delete win.VildaVaultProtocol;
  delete win.VildaSession;
  win.VildaVault = { isUnlocked: () => false, getCurrentUser: () => null };
  const originalVault = win.VildaVault;
  const doc = {
    readyState: 'loading', addEventListener() {}, dispatchEvent() {}, getElementById: () => null,
    documentElement: { classList: { contains: () => false } },
    querySelector: () => null,
    createElement(tag) {
      const listeners = new Map();
      return { tagName: tag, addEventListener(type, callback) { listeners.set(type, callback); },
        loaded() { listeners.get('load')?.(); } };
    },
    head: { appendChild(node) {
      if (node.src) {
        const file = node.src.split('?')[0];
        scripts.push(file);
        if (file !== 'vilda_vault_protocol.js') throw new Error('Unexpected existing dependency reload: ' + file);
        loadBrowserScript(file, win);
      }
      node.loaded();
      return node;
    } },
  };
  win.document = doc;
  return { win, doc, scripts, originalVault };
}

describe('inactive patient protocol dependency', () => {
  it('is declared before vault in every actual static vault page', () => {
    for (const file of ['app.html', 'index.html', 'docpro.html', 'kalkulator-klirens.html',
      'notatki.html', 'terminarz.html', 'ustawienia.html', 'subskrypcja.html']) {
      const source = read(file);
      const protocol = source.indexOf('src="vilda_vault_protocol.js?v=');
      const vault = source.indexOf('src="vilda_vault.js?v=');
      expect(protocol, file).toBeGreaterThan(-1);
      expect(protocol, file).toBeLessThan(vault);
      expect(source.match(/src="vilda_vault_protocol\.js\?v=/g), file).toHaveLength(1);
    }
    expect(read('service-worker-kalorii.js')).toContain("'/vilda_vault_protocol.js?v=1'");
  });

  it.each([
    ['chrome', chromeLoader, 'href'], ['session', bridge.slice(bridge.indexOf('V=['), bridge.indexOf('],c=')), 'src'],
  ])('%s keeps the protocol before the same legacy vault dependency', (name, source, key) => {
    const files = [...source.matchAll(new RegExp(key + ':"([^"?]+)\\?v=\\d+"', 'g'))].map(match => match[1]);
    expect(files.filter(file => file === 'vilda_vault_protocol.js')).toHaveLength(1);
    expect(files.indexOf('vilda_vault_protocol.js')).toBeLessThan(files.indexOf('vilda_vault.js'));
  });

  it.each(['chrome', 'session'])('%s loads the real missing protocol once without replacing the vault', async loader => {
    const env = environment(loader === 'chrome' ? chromeLoader : bridge);
    let ensure;
    if (loader === 'chrome') ensure = new Function('r', 'o', chromeLoader + ';return u;')(env.win, env.doc);
    else {
      loadBrowserScript('vilda_session_bridge.js', env.win);
      ensure = () => env.win.VildaSession.ensureAuthLoaded();
    }
    await ensure();
    expect(env.scripts).toEqual(['vilda_vault_protocol.js']);
    expect(env.win.VildaVault).toBe(env.originalVault);
    expect(env.win.VildaVaultProtocol.getContract()).toMatchObject({
      namespace: 'patient-clinical-vault', protocol: 1, writeAvailable: false,
    });
    expect(env.win.VildaVaultProtocol.selectClinicalRoute(null).mode).toBe('legacy');
    await ensure();
    expect(env.scripts).toEqual(['vilda_vault_protocol.js']);
  });
});
