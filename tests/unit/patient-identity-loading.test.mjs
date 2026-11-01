import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const MODULES = [
  { file: 'vilda_patient_identity_protocol.js', global: 'VildaPatientIdentityProtocol' },
  { file: 'vilda_patient_identity_transport.js', global: 'VildaPatientIdentityTransport' },
];
const ORDER = ['vilda_clinical_crypto.js', 'vilda_vault_protocol.js', ...MODULES.map(value => value.file), 'vilda_vault.js'];
const PAGES = ['app.html', 'index.html', 'docpro.html', 'kalkulator-klirens.html',
  'notatki.html', 'terminarz.html', 'ustawienia.html', 'subskrypcja.html'];
const read = file => readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
function loaders() {
  const chrome = read('vilda_chrome.js'), session = read('vilda_session_bridge.js');
  const start = chrome.indexOf('var d=[{type:"css",href:"vilda_auth_ui.css');
  const end = chrome.indexOf('function l(){var f=r.VildaAuthUI', start);
  const arrayStart = session.indexOf('V=['), arrayEnd = session.indexOf('],c=', arrayStart);
  if (start < 0 || end <= start || arrayStart < 0 || arrayEnd <= arrayStart) throw Error('Actual production auth loader not found');
  return { chrome: chrome.slice(start, end), session, sessionArray: session.slice(arrayStart, arrayEnd) };
}
function assertOrder(urls, label) {
  let preceding = -1;
  for (const file of ORDER) {
    const indexes = urls.map((url, index) => url.split('?')[0] === file ? index : -1).filter(index => index >= 0);
    expect(indexes, label + ': exactly one ' + file).toHaveLength(1);
    expect(urls[indexes[0]], label + ': versioned ' + file).toMatch(/\?v=\d+$/);
    expect(indexes[0], label + ': dependency order for ' + file).toBeGreaterThan(preceding);
    preceding = indexes[0];
  }
}
function browser(source, missing) {
  const effects = [], scripts = [], failures = [], nodes = new Map();
  const denied = name => function () { effects.push(name); throw Error('Unexpected recovery loading effect: ' + name); };
  const win = { TextEncoder, TextDecoder, addEventListener() {}, removeEventListener() {},
    sessionStorage: { getItem: () => null, setItem: denied('sessionStorage.setItem') },
    localStorage: { getItem: () => null, setItem: denied('localStorage.setItem') },
    fetch: denied('fetch'), setTimeout: denied('setTimeout'), setInterval: denied('setInterval'),
    crypto: { getRandomValues: denied('crypto.getRandomValues'),
      subtle: new Proxy({}, { get: (_, key) => denied('crypto.subtle.' + String(key)) }) },
    indexedDB: { open: denied('indexedDB.open'), deleteDatabase: denied('indexedDB.deleteDatabase') },
    navigator: { sendBeacon: denied('sendBeacon') },
    CustomEvent: class { constructor(type) { this.type = type; } } };
  for (const match of source.matchAll(/(?:r|n)\.(Vilda[A-Za-z0-9]+)/g)) win[match[1]] = {};
  for (const dependency of MODULES) win[dependency.global] = {};
  for (const dependency of missing) delete win[dependency.global];
  delete win.VildaSession;
  const originalVault = Object.freeze({ isUnlocked: () => false, getCurrentUser: () => null });
  const originalCrypto = Object.freeze({ marker: 'fictional-existing-legacy-crypto' });
  win.VildaVault = originalVault; win.VildaCrypto = originalCrypto;
  const previous = new Map(MODULES.filter(dependency => !missing.includes(dependency)).map(dependency => [dependency.global, win[dependency.global]]));
  function node(tag) {
    const listeners = new Map();
    return { tagName: tag.toUpperCase(),
      addEventListener(type, callback) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(callback);
      },
      emit(type, event) { for (const callback of listeners.get(type) || []) callback(event); } };
  }
  const doc = { readyState: 'loading', addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    getElementById: () => null, documentElement: { classList: { contains: () => false } },
    querySelector(selector) {
      if (selector.startsWith('link[')) return {};
      for (const [file, element] of nodes) if (selector.includes(file)) return element;
      return null;
    }, createElement: node,
    head: { appendChild(element) {
      if (!element.src) { element.emit('load'); return element; }
      const file = element.src.split('?')[0]; scripts.push(file); nodes.set(file, element);
      Promise.resolve().then(() => {
        if (!missing.some(dependency => dependency.file === file)) throw Error('Unexpected existing dependency reload: ' + file);
        runInContext(read(file), context, { filename: file }); element.emit('load');
      }).catch(error => { failures.push(String(error)); element.emit('error', error); });
      return element;
    } } };
  win.document = doc; win.window = win; win.self = win;
  const context = createContext(win);
  return { win, context, scripts,
    ensure(loader, sources) {
      if (loader === 'chrome') return runInContext('(function(){var r=window,o=document;' + sources.chrome + ';return u;})()', context);
      runInContext(sources.session, context, { filename: 'vilda_session_bridge.js' });
      return () => win.VildaSession.ensureAuthLoaded();
    },
    expectInert() {
      expect(effects).toEqual([]); expect(failures).toEqual([]);
      expect(win.VildaVault).toBe(originalVault); expect(win.VildaCrypto).toBe(originalCrypto);
      for (const [name, value] of previous) expect(win[name]).toBe(value);
    } };
}

describe('inactive identity recovery dependencies', () => {
  it('orders real crypto, authority protocol and identity modules before vault on all eight pages', () => {
    for (const file of PAGES) {
      const tags = [...read(file).matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)];
      assertOrder(tags.map(match => match[1]), file);
      for (const dependency of MODULES) {
        expect(tags.find(match => match[1].split('?')[0] === dependency.file)[0], file + ': defer ' + dependency.file).toMatch(/\bdefer\b/i);
      }
    }
    const worker = read('service-worker-kalorii.js');
    for (const dependency of MODULES) expect(worker).toMatch(new RegExp("'/" + dependency.file.replaceAll('.', '\\.') + '\\?v=\\d+\''));
  });

  it.each(['chrome', 'session'])('%s declares the same production dependency order', loader => {
    const sources = loaders(), source = loader === 'chrome' ? sources.chrome : sources.sessionArray;
    const key = loader === 'chrome' ? 'href' : 'src';
    assertOrder([...source.matchAll(new RegExp(key + ':"([^"?]+\\?v=\\d+)"', 'g'))].map(match => match[1]), loader);
  });

  it.each(MODULES)('$file import and getContract never read platform or dependency getters', dependency => {
    const win = {}, reads = [];
    for (const key of ['crypto', 'fetch', 'document', 'indexedDB', 'localStorage', 'sessionStorage', 'navigator',
      'AbortController', 'TextEncoder', 'TextDecoder', 'setTimeout', 'setInterval', 'requestAnimationFrame',
      'VildaClinicalCrypto', 'VildaVaultProtocol']) {
      Object.defineProperty(win, key, { get() { reads.push(key); throw Error('Forbidden inert import getter: ' + key); } });
    }
    win.window = win; const context = createContext(win);
    runInContext(read(dependency.file), context, { filename: dependency.file });
    expect(win[dependency.global].getContract()).toMatchObject({ namespace: 'patient-clinical-identity-locator', protocol: 1, writeAvailable: false });
    expect(Object.isFrozen(win[dependency.global])).toBe(true);
    expect(Object.isFrozen(win[dependency.global].getContract())).toBe(true);
    expect(reads).toEqual([]);
  });

  for (const loader of ['chrome', 'session']) {
    it.each(MODULES)(loader + ' loads only missing $global despite an existing vault and all old dependencies', async dependency => {
      const sources = loaders(), env = browser(sources[loader], [dependency]);
      const ensure = env.ensure(loader, sources);
      await Promise.all([ensure(), ensure()]);
      expect(env.scripts).toEqual([dependency.file]);
      expect(env.win[dependency.global].getContract()).toMatchObject({ writeAvailable: false });
      await ensure(); expect(env.scripts).toEqual([dependency.file]); env.expectInert();
    });
    it(loader + ' loads both missing real identity modules once in order without replacing the vault', async () => {
      const sources = loaders(), env = browser(sources[loader], MODULES);
      const ensure = env.ensure(loader, sources);
      await Promise.all([ensure(), ensure()]);
      expect(env.scripts).toEqual(MODULES.map(dependency => dependency.file));
      for (const dependency of MODULES) expect(env.win[dependency.global].getContract()).toMatchObject({ writeAvailable: false });
      await ensure(); expect(env.scripts).toEqual(MODULES.map(dependency => dependency.file)); env.expectInert();
    });
  }
});
