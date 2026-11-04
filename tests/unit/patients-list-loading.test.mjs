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
  const scripts = [], styles = [];
  const win = {
    sessionStorage: { getItem: () => null }, addEventListener() {},
    CustomEvent: class { constructor(type) { this.type = type; } },
  };
  // The real missing view module must be loaded even when a previously loaded
  // AuthUI/Vault exists. All unrelated dependencies remain untouched.
  for (const match of source.matchAll(/(?:r|n)\.(Vilda[A-Za-z0-9]+)/g)) win[match[1]] = {};
  delete win.VildaPatientsList;
  delete win.VildaSession;
  win.VildaVault = { isUnlocked: () => false, getCurrentUser: () => null };
  const originalVault = win.VildaVault;
  const originalAuth = win.VildaAuthUI;
  const doc = {
    readyState: 'loading', addEventListener() {}, dispatchEvent() {}, getElementById: () => null,
    documentElement: { classList: { contains: () => false } }, querySelector: () => null,
    createElement(tag) {
      const listeners = new Map();
      return { tagName: tag, addEventListener(type, callback) { listeners.set(type, callback); },
        loaded() { listeners.get('load')?.(); } };
    },
    head: { appendChild(node) {
      if (node.src) {
        const file = node.src.split('?')[0];
        scripts.push(file);
        if (file !== 'vilda_patients_list.js') throw new Error('Unexpected existing dependency reload: ' + file);
        loadBrowserScript(file, win);
      } else if (node.href) styles.push(node.href);
      node.loaded();
      return node;
    } },
  };
  win.document = doc;
  return { win, doc, scripts, styles, originalVault, originalAuth };
}

describe('patient database view dependency', () => {
  it('loads the view before auth in every static auth entry, with its own stylesheet and offline URLs', () => {
    for (const file of ['app.html', 'index.html', 'docpro.html', 'kalkulator-klirens.html',
      'notatki.html', 'terminarz.html', 'ustawienia.html', 'subskrypcja.html']) {
      const source = read(file);
      const view = source.indexOf('src="vilda_patients_list.js?v=');
      const auth = source.indexOf('src="vilda_auth_ui.js?v=');
      expect(view, file).toBeGreaterThan(-1);
      expect(view, file).toBeLessThan(auth);
      expect(source.match(/src="vilda_patients_list\.js\?v=/g), file).toHaveLength(1);
      expect(source.match(/href="vilda_patients_list\.css\?v=/g), file).toHaveLength(1);
      expect(source.indexOf('href="vilda_patients_list.css?'), file)
        .toBeGreaterThan(source.indexOf('href="vilda_auth_ui.css?'));
    }
    const worker = read('service-worker-kalorii.js');
    const html = read('index.html');
    for (const asset of ['vilda_patients_list.js', 'vilda_patients_list.css']) {
      const url = html.match(new RegExp(asset.replaceAll('.', '\\.') + '\\?v=\\d+'))?.[0];
      expect(url, asset + ' current URL').toBeTruthy();
      expect(worker).toContain("'/" + url + "'");
    }
  });

  it.each([
    ['chrome', chromeLoader, 'href'], ['session', bridge.slice(bridge.indexOf('V=['), bridge.indexOf('],c=')), 'src'],
  ])('%s declares the view after the vault and before auth', (name, source, key) => {
    const files = [...source.matchAll(new RegExp(key + ':"([^"?]+)\\?v=\\d+"', 'g'))].map(match => match[1]);
    expect(files.filter(file => file === 'vilda_patients_list.js')).toHaveLength(1);
    expect(files.filter(file => file === 'vilda_patients_list.css')).toHaveLength(1);
    expect(files.indexOf('vilda_patients_list.js')).toBeGreaterThan(files.indexOf('vilda_vault.js'));
    expect(files.indexOf('vilda_patients_list.js')).toBeLessThan(files.indexOf('vilda_auth_ui.js'));
  });

  it.each(['chrome', 'session'])('%s loads the actual missing view once without replacing auth or vault', async loader => {
    const env = environment(loader === 'chrome' ? chromeLoader : bridge);
    let ensure;
    if (loader === 'chrome') ensure = new Function('r', 'o', chromeLoader + ';return u;')(env.win, env.doc);
    else {
      loadBrowserScript('vilda_session_bridge.js', env.win);
      ensure = () => env.win.VildaSession.ensureAuthLoaded();
    }
    await ensure();
    expect(env.scripts).toEqual(['vilda_patients_list.js']);
    expect(env.styles.filter(file => file.startsWith('vilda_patients_list.css?'))).toEqual([expect.stringMatching(/^vilda_patients_list\.css\?v=\d+$/)]);
    expect(env.win.VildaVault).toBe(env.originalVault);
    expect(env.win.VildaAuthUI).toBe(env.originalAuth);
    expect(env.win.VildaPatientsList.create).toBeTypeOf('function');
    await ensure();
    expect(env.scripts).toEqual(['vilda_patients_list.js']);
    expect(env.styles.filter(file => file.startsWith('vilda_patients_list.css?'))).toHaveLength(1);
  });
});
