#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const IOS_SOURCE_PATH = path.join(ROOT, 'ios26-ui.js');
const source = fs.readFileSync(IOS_SOURCE_PATH, 'utf8');

function createClassList() {
  const set = new Set();
  return {
    add: (...names) => names.forEach((name) => set.add(String(name))),
    remove: (...names) => names.forEach((name) => set.delete(String(name))),
    toggle: (name, force) => {
      const key = String(name);
      const shouldHave = typeof force === 'boolean' ? force : !set.has(key);
      if (shouldHave) set.add(key);
      else set.delete(key);
      return shouldHave;
    },
    contains: (name) => set.has(String(name)),
    toString: () => Array.from(set).join(' ')
  };
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName || 'div').toUpperCase();
    this.ownerDocument = ownerDocument || null;
    this.children = [];
    this.parentNode = null;
    this.attributes = Object.create(null);
    this.listeners = Object.create(null);
    this.dataset = Object.create(null);
    this.style = {};
    this.classList = createClassList();
    this.textContent = '';
    this._id = '';
  }
  set id(value) {
    this._id = String(value || '');
    if (this._id) this.attributes.id = this._id;
  }
  get id() { return this._id || ''; }
  setAttribute(name, value) {
    const key = String(name);
    const val = String(value);
    this.attributes[key] = val;
    if (key === 'id') this.id = val;
    if (key === 'class') {
      val.split(/\s+/).filter(Boolean).forEach((item) => this.classList.add(item));
    }
    if (key.startsWith('data-')) {
      const dsKey = key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      this.dataset[dsKey] = val;
    }
  }
  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
  }
  removeAttribute(name) {
    delete this.attributes[name];
  }
  appendChild(child) {
    if (!child) return child;
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  append(...nodes) {
    nodes.forEach((node) => {
      if (typeof node === 'string') {
        const textNode = new FakeElement('#text', this.ownerDocument);
        textNode.textContent = node;
        this.appendChild(textNode);
      } else {
        this.appendChild(node);
      }
    });
  }
  remove() {
    if (!this.parentNode) return;
    const idx = this.parentNode.children.indexOf(this);
    if (idx !== -1) this.parentNode.children.splice(idx, 1);
    this.parentNode = null;
  }
  addEventListener(type, handler) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(handler);
  }
  dispatchEvent(event) {
    const evt = event || {};
    evt.target = evt.target || this;
    (this.listeners[evt.type] || []).slice().forEach((handler) => handler.call(this, evt));
  }
  click() { this.dispatchEvent({ type: 'click' }); }
  matchesSelector(selector) {
    if (!selector) return false;
    if (selector[0] === '#') return this.id === selector.slice(1);
    if (selector[0] === '.') return this.classList.contains(selector.slice(1));
    return this.tagName.toLowerCase() === selector.toLowerCase();
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
  querySelectorAll(selector) {
    const found = [];
    const selectors = String(selector || '').split(',').map((s) => s.trim()).filter(Boolean);
    const walk = (node) => {
      node.children.forEach((child) => {
        if (selectors.some((sel) => child.matchesSelector(sel))) found.push(child);
        walk(child);
      });
    };
    walk(this);
    return found;
  }
}

class FakeDocument {
  constructor() {
    this.listeners = Object.create(null);
    this.readyState = 'complete';
    this.documentElement = new FakeElement('html', this);
    this.head = new FakeElement('head', this);
    this.body = new FakeElement('body', this);
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
    this.fonts = { ready: Promise.resolve() };
    this.hidden = false;
  }
  createElement(tagName) { return new FakeElement(tagName, this); }
  getElementById(id) { return this.documentElement.querySelector(`#${id}`); }
  querySelector(selector) { return this.documentElement.querySelector(selector); }
  querySelectorAll(selector) { return this.documentElement.querySelectorAll(selector); }
  addEventListener(type, handler) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(handler);
  }
  dispatchEvent(event) {
    (this.listeners[event.type] || []).slice().forEach((handler) => handler.call(this, event));
  }
}

function appendBannerChildren(element) {
  element.children = [];
  const span = new FakeElement('span', element.ownerDocument);
  span.setAttribute('class', 'ww-sw-update-banner__message');
  span.textContent = 'Nowa wersja aplikacji — przeładować?';
  const actions = new FakeElement('div', element.ownerDocument);
  actions.setAttribute('class', 'ww-sw-update-banner__actions');
  const refresh = new FakeElement('button', element.ownerDocument);
  refresh.id = 'sw-refresh';
  refresh.setAttribute('type', 'button');
  refresh.setAttribute('class', 'btn ww-sw-refresh--pulse');
  refresh.setAttribute('data-vilda-sw-update-action', 'refresh');
  refresh.setAttribute('aria-label', 'Przeładuj aplikację i zastosuj nową wersję');
  refresh.textContent = 'Przeładuj';
  const dismiss = new FakeElement('button', element.ownerDocument);
  dismiss.id = 'sw-dismiss';
  dismiss.setAttribute('type', 'button');
  dismiss.setAttribute('class', 'btn');
  dismiss.setAttribute('data-vilda-sw-update-action', 'dismiss');
  dismiss.setAttribute('aria-label', 'Odłóż aktualizację aplikacji na później');
  dismiss.textContent = 'Później';
  actions.appendChild(refresh);
  actions.appendChild(dismiss);
  element.appendChild(span);
  element.appendChild(actions);
  return true;
}

function makeEventTarget() {
  const listeners = Object.create(null);
  return {
    listeners,
    addEventListener(type, handler) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(handler);
    },
    dispatchEvent(event) {
      (listeners[event.type] || []).slice().forEach((handler) => handler.call(this, event));
    }
  };
}

function createContext() {
  const document = new FakeDocument();
  const postedMessages = [];
  const waitingWorker = Object.assign(makeEventTarget(), {
    state: 'installed',
    postMessage(message) { postedMessages.push(message); }
  });
  const registration = Object.assign(makeEventTarget(), {
    scope: 'https://example.test/',
    waiting: waitingWorker,
    installing: waitingWorker
  });
  let registerCount = 0;
  const serviceWorker = Object.assign(makeEventTarget(), {
    controller: { scriptURL: '/service-worker-kalorii.js' },
    register(script) {
      registerCount += 1;
      serviceWorker.lastRegisterScript = script;
      return Promise.resolve(registration);
    }
  });
  const window = makeEventTarget();
  const quietConsole = {
    log: console.log.bind(console),
    error: console.error.bind(console),
    warn() {},
    info() {},
    debug() {}
  };
  class FakeIntersectionObserver {
    constructor(callback) { this.callback = callback; }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.assign(window, {
    document,
    navigator: { serviceWorker },
    VildaHtml: { setTrustedHtml: appendBannerChildren },
    console: quietConsole,
    IntersectionObserver: FakeIntersectionObserver,
    location: { reload() { window.reloadCount = (window.reloadCount || 0) + 1; } },
    matchMedia() { return { matches: false, addEventListener() {}, addListener() {}, removeEventListener() {}, removeListener() {} }; },
    requestAnimationFrame() { return 0; },
    setTimeout() { return 0; },
    clearTimeout() {},
    visualViewport: null,
    __postedMessages: postedMessages,
    __getRegisterCount() { return registerCount; }
  });
  const context = {
    window,
    document,
    navigator: window.navigator,
    console: quietConsole,
    IntersectionObserver: FakeIntersectionObserver,
    Promise,
    setTimeout: window.setTimeout,
    clearTimeout: window.clearTimeout,
    requestAnimationFrame: window.requestAnimationFrame
  };
  context.globalThis = context;
  return { context, window, document, serviceWorker, registration, waitingWorker, postedMessages };
}

async function boot() {
  const env = createContext();
  vm.runInNewContext(source, env.context, { filename: 'ios26-ui.js' });
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  return env;
}

function add(results, id, ok, details) {
  results.push({ id, ok: !!ok, details: details || {} });
}

(async () => {
  const results = [];
  add(results, 'source-step-version-and-alias',
    source.includes("const SW_CLIENT_LIFECYCLE_STEP = '8O-11k';") &&
    source.includes("const SW_CLIENT_LIFECYCLE_VERSION = '1.1.0';") &&
    source.includes('vildaGetServiceWorkerUpdateUxSnapshot'),
    { step: '8O-11k', version: '1.1.0' });

  const env = await boot();
  const banner = env.document.getElementById('sw-update-banner');
  const refresh = banner && banner.querySelector('#sw-refresh');
  const dismiss = banner && banner.querySelector('#sw-dismiss');
  add(results, 'bootstrap-after-lifecycle-constants-registers-on-complete-document',
    env.window.__getRegisterCount() === 1 && env.serviceWorker.lastRegisterScript === '/service-worker-kalorii.js',
    { registerCount: env.window.__getRegisterCount(), script: env.serviceWorker.lastRegisterScript || null });
  add(results, 'banner-rendered-as-accessible-singleton-alert',
    !!(banner && banner.getAttribute('role') === 'alert' && banner.getAttribute('aria-live') === 'polite' && banner.getAttribute('aria-atomic') === 'true' && banner.dataset.vildaSwUpdateBannerStep === '8O-11k'),
    { exists: !!banner, role: banner && banner.getAttribute('role'), live: banner && banner.getAttribute('aria-live'), step: banner && banner.dataset.vildaSwUpdateBannerStep });
  add(results, 'banner-buttons-are-explicit-and-labelled',
    !!(refresh && dismiss && refresh.getAttribute('type') === 'button' && dismiss.getAttribute('type') === 'button' && refresh.getAttribute('aria-label') && dismiss.getAttribute('aria-label') && refresh.getAttribute('data-vilda-sw-update-action') === 'refresh' && dismiss.getAttribute('data-vilda-sw-update-action') === 'dismiss'),
    { refreshType: refresh && refresh.getAttribute('type'), dismissType: dismiss && dismiss.getAttribute('type') });

  if (refresh) {
    refresh.click();
    refresh.click();
  }
  const refreshSnapshot = typeof env.window.vildaGetServiceWorkerUpdateUxSnapshot === 'function'
    ? env.window.vildaGetServiceWorkerUpdateUxSnapshot()
    : null;
  add(results, 'refresh-click-posts-single-skip-waiting',
    env.postedMessages.length === 1 && env.postedMessages[0] && env.postedMessages[0].type === 'SKIP_WAITING' &&
    refreshSnapshot && refreshSnapshot.updateBannerRefreshHandledCount === 1 && refreshSnapshot.updateBannerDuplicateRefreshClickCount === 1,
    { postedMessages: env.postedMessages, snapshot: refreshSnapshot });
  add(results, 'update-ux-snapshot-is-read-only-and-side-effect-free',
    refreshSnapshot && refreshSnapshot.readOnly === true && refreshSnapshot.registeredServiceWorkerFromSnapshot === false && refreshSnapshot.postedSkipWaitingFromSnapshot === false && refreshSnapshot.reloadedPageFromSnapshot === false,
    { snapshot: refreshSnapshot });

  const envDismiss = await boot();
  const dismissBanner = envDismiss.document.getElementById('sw-update-banner');
  const dismissButton = dismissBanner && dismissBanner.querySelector('#sw-dismiss');
  if (dismissButton) dismissButton.click();
  const dismissSnapshot = typeof envDismiss.window.vildaGetServiceWorkerUpdateUxSnapshot === 'function'
    ? envDismiss.window.vildaGetServiceWorkerUpdateUxSnapshot()
    : null;
  add(results, 'dismiss-click-removes-banner-without-skip-waiting',
    envDismiss.postedMessages.length === 0 && !envDismiss.document.getElementById('sw-update-banner') &&
    dismissSnapshot && dismissSnapshot.updateBannerDismissHandledCount === 1 && dismissSnapshot.updateBannerActive === false,
    { postedMessages: envDismiss.postedMessages, snapshot: dismissSnapshot });

  add(results, 'mocked-dom-service-worker-only', true, {
    registersRealServiceWorker: false,
    touchesRealCacheApi: false,
    touchesIndexedDb: false
  });

  const failed = results.filter((item) => item.ok !== true);
  const output = {
    name: 'service-worker-client-update-ux-smoke',
    step: '8O-11k',
    version: '1.0.0',
    readOnly: true,
    mockedDomOnly: true,
    registersRealServiceWorker: false,
    touchesRealCacheApi: false,
    touchesIndexedDb: false,
    ok: failed.length === 0,
    failedCount: failed.length,
    total: results.length,
    results,
    failed
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (failed.length) process.exitCode = 1;
})().catch((error) => {
  process.stdout.write(`${JSON.stringify({
    name: 'service-worker-client-update-ux-smoke',
    step: '8O-11k',
    ok: false,
    failedCount: 1,
    total: 1,
    error: error && error.stack ? error.stack : String(error || 'unknown-error')
  }, null, 2)}\n`);
  process.exitCode = 1;
});
