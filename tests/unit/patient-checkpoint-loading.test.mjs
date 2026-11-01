import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const MODULES = [
  { file: 'vilda_clinical_crypto.js', global: 'VildaClinicalCrypto' },
  { file: 'vilda_patient_checkpoint_store.js', global: 'VildaPatientCheckpointStore' },
  { file: 'vilda_patient_checkpoint.js', global: 'VildaPatientCheckpoint' },
];
const PAGES = ['app.html', 'index.html', 'docpro.html', 'kalkulator-klirens.html',
  'notatki.html', 'terminarz.html', 'ustawienia.html', 'subskrypcja.html'];
const read = file => readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
// Asset revisions follow the shared fixture: 6d advances clinical crypto while
// the checkpoint protocol and the other checkpoint modules remain unchanged.
const resourceVersions = JSON.parse(read('tests/fixtures/wersje-zasobow.json'));
const moduleUrl = dependency => dependency.file + '?v=' + resourceVersions[dependency.file].v;

// Read production files inside the test, including modules that another owner
// may still be generating when this suite is first discovered.
function loaders() {
  const chrome = read('vilda_chrome.js');
  const start = chrome.indexOf('var d=[{type:"css",href:"vilda_auth_ui.css');
  const end = chrome.indexOf('function l(){var f=r.VildaAuthUI', start);
  if (start < 0 || end <= start) throw new Error('Actual chrome auth loader not found');
  const session = read('vilda_session_bridge.js');
  const arrayStart = session.indexOf('V=[');
  const arrayEnd = session.indexOf('],c=', arrayStart);
  if (arrayStart < 0 || arrayEnd <= arrayStart) throw new Error('Actual session auth dependencies not found');
  return { chrome: chrome.slice(start, end), session, sessionArray: session.slice(arrayStart, arrayEnd) };
}

function browser(source = '', missing = MODULES) {
  const effects = [];
  const scripts = [];
  const failures = [];
  const nodes = new Map();
  const deny = name => function () { effects.push(name); throw new Error('Unexpected startup effect: ' + name); };
  const storage = name => ({ getItem: () => null, setItem: deny(name + '.setItem'),
    removeItem: deny(name + '.removeItem'), clear: deny(name + '.clear') });
  const nativeCrypto = {
    subtle: new Proxy({}, { get: (_, name) => deny('crypto.subtle.' + String(name)) }),
    getRandomValues: deny('crypto.getRandomValues'), randomUUID: deny('crypto.randomUUID'),
  };
  const win = {
    console, TextEncoder, TextDecoder,
    indexedDB: { open: deny('indexedDB.open'), deleteDatabase: deny('indexedDB.deleteDatabase'),
      databases: deny('indexedDB.databases') },
    crypto: nativeCrypto,
    sessionStorage: storage('sessionStorage'), localStorage: storage('localStorage'),
    fetch: deny('fetch'), XMLHttpRequest: deny('XMLHttpRequest'),
    WebSocket: deny('WebSocket'), EventSource: deny('EventSource'),
    navigator: { sendBeacon: deny('navigator.sendBeacon') },
    setTimeout: deny('setTimeout'), setInterval: deny('setInterval'),
    requestAnimationFrame: deny('requestAnimationFrame'), requestIdleCallback: deny('requestIdleCallback'),
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
  };
  // Every old dependency is ready: each test can isolate a single missing new
  // module and catch a loader's premature "already ready" return.
  for (const match of source.matchAll(/(?:r|n)\.(Vilda[A-Za-z0-9]+)/g)) win[match[1]] = {};
  for (const dependency of MODULES) win[dependency.global] = {};
  for (const dependency of missing) delete win[dependency.global];
  delete win.VildaSession;
  const originalVault = Object.freeze({ isUnlocked: () => false, getCurrentUser: () => null });
  const originalCrypto = Object.freeze({ marker: 'existing-legacy-crypto',
    encrypt: deny('VildaCrypto.encrypt'), decrypt: deny('VildaCrypto.decrypt') });
  win.VildaVault = originalVault;
  win.VildaCrypto = originalCrypto;

  function node(tag) {
    const listeners = new Map();
    return {
      tagName: tag.toUpperCase(),
      addEventListener(type, callback) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(callback);
      },
      emit(type, event) { for (const callback of listeners.get(type) || []) callback(event); },
    };
  }
  const doc = {
    readyState: 'loading', addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    getElementById: () => null,
    documentElement: { classList: { contains: () => false } },
    querySelector(selector) {
      if (selector.startsWith('link[')) return {}; // Existing CSS is unrelated to these script tests.
      for (const [file, element] of nodes) if (selector.includes(file)) return element;
      return null;
    },
    createElement: node,
    head: { appendChild(element) {
      if (!element.src) { element.emit('load'); return element; }
      const file = element.src.split('?')[0];
      scripts.push(file);
      nodes.set(file, element);
      // A microtask keeps concurrent ensure() calls on the real existing-tag
      // branch, rather than making script execution artificially synchronous.
      Promise.resolve().then(() => {
        if (!missing.some(dependency => dependency.file === file)) {
          throw new Error('Unexpected existing dependency reload: ' + file);
        }
        runInContext(read(file), context, { filename: file });
        element.emit('load');
      }).catch(error => { failures.push(String(error)); element.emit('error', error); });
      return element;
    } },
  };
  win.document = doc;
  win.window = win;
  win.self = win;
  const context = createContext(win);
  return {
    win, context, effects, scripts, failures,
    execute(file) { runInContext(read(file), context, { filename: file }); },
    expectInert() {
      expect(effects).toEqual([]);
      expect(failures).toEqual([]);
      expect(win.VildaVault).toBe(originalVault);
      expect(win.VildaCrypto).toBe(originalCrypto);
      expect(win.crypto).toBe(nativeCrypto);
    },
  };
}

function ensureFrom(loader, sources, env) {
  if (loader === 'chrome') {
    return runInContext('(function(){var r=window,o=document;' + sources.chrome + ';return u;})()', env.context);
  }
  env.execute('vilda_session_bridge.js');
  return () => env.win.VildaSession.ensureAuthLoaded();
}

describe('inactive patient checkpoint dependencies', () => {
  it('loads each checkpoint module once, in dependency order before vault on all eight pages', () => {
    for (const file of PAGES) {
      const tags = [...read(file).matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)];
      const vault = tags.findIndex(match => /^vilda_vault\.js\?v=\d+$/.test(match[1]));
      expect(vault, file).toBeGreaterThan(-1);
      let preceding = -1;
      for (const dependency of MODULES) {
        const matches = tags.filter(match => match[1] === moduleUrl(dependency));
        expect(matches, file + ': ' + dependency.file).toHaveLength(1);
        expect(matches[0][0], file + ': deferred ' + dependency.file).toMatch(/\bdefer\b/i);
        const index = tags.indexOf(matches[0]);
        expect(index, file + ': module dependency order').toBeGreaterThan(preceding);
        expect(index, file + ': module before vault').toBeLessThan(vault);
        preceding = index;
      }
    }
    const serviceWorker = read('service-worker-kalorii.js');
    for (const dependency of MODULES) expect(serviceWorker).toContain("'/" + moduleUrl(dependency) + "'");
  });

  it.each(['chrome', 'session'])('%s declares each new module before the same vault dependency', loader => {
    const sources = loaders();
    const source = loader === 'chrome' ? sources.chrome : sources.sessionArray;
    const key = loader === 'chrome' ? 'href' : 'src';
    const urls = [...source.matchAll(new RegExp(key + ':"([^"?]+\\?v=\\d+)"', 'g'))].map(match => match[1]);
    const vault = urls.findIndex(url => /^vilda_vault\.js\?v=\d+$/.test(url));
    expect(vault).toBeGreaterThan(-1);
    let preceding = -1;
    for (const dependency of MODULES) {
      const url = moduleUrl(dependency);
      expect(urls.filter(value => value === url)).toHaveLength(1);
      expect(urls.indexOf(url)).toBeGreaterThan(preceding);
      expect(urls.indexOf(url)).toBeLessThan(vault);
      preceding = urls.indexOf(url);
    }
  });

  it.each(MODULES)('$file publishes its API without storage, crypto, network, timers or session writes', async dependency => {
    const env = browser();
    env.execute(dependency.file);
    await Promise.resolve();
    await Promise.resolve();
    expect(env.win[dependency.global]).toBeDefined();
    expect(['object', 'function']).toContain(typeof env.win[dependency.global]);
    expect(env.scripts).toEqual([]);
    env.expectInert();
  });

  it('loading the three real modules together remains inert', async () => {
    const env = browser();
    for (const dependency of MODULES) env.execute(dependency.file);
    await Promise.resolve();
    await Promise.resolve();
    for (const dependency of MODULES) expect(env.win[dependency.global]).toBeDefined();
    expect(env.scripts).toEqual([]);
    env.expectInert();
  });

  for (const loader of ['chrome', 'session']) {
    it.each(MODULES)(loader + ' fills only missing $global despite all old dependencies being ready', async dependency => {
      const sources = loaders();
      const env = browser(sources[loader], [dependency]);
      const ensure = ensureFrom(loader, sources, env);
      await Promise.all([ensure(), ensure()]);
      expect(env.scripts).toEqual([dependency.file]);
      expect(env.win[dependency.global]).toBeDefined();
      await ensure();
      expect(env.scripts).toEqual([dependency.file]);
      env.expectInert();
    });

    it(loader + ' loads all missing modules once in order and keeps the existing vault and crypto', async () => {
      const sources = loaders();
      const env = browser(sources[loader]);
      const ensure = ensureFrom(loader, sources, env);
      await Promise.all([ensure(), ensure()]);
      expect(env.scripts).toEqual(MODULES.map(dependency => dependency.file));
      for (const dependency of MODULES) expect(env.win[dependency.global]).toBeDefined();
      await ensure();
      expect(env.scripts).toEqual(MODULES.map(dependency => dependency.file));
      env.expectInert();
    });
  }
});
