import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const DEPENDENCIES = [
  'VildaCrypto', 'VildaLabSnapshot', 'VildaLabTestosteroneUnits', 'VildaLabAssessmentUI',
  'VildaHormoneReferenceSnapshot', 'VildaLabRangeSnapshot', 'VildaHormoneReferenceUI',
  'VildaLabHistory', 'VildaLabHistoryTab', 'VildaPubertyAssessment', 'VildaProAccess',
];

function environment(careReady = false) {
  const documentListeners = new Map(), appended = [], existing = [
    { href: 'vilda_auth_ui.css?v=existing' },
    { href: 'vilda_lab_assessment_ui.css?v=existing' },
    { href: 'vilda_lab_history_tab.css?v=existing' },
  ];
  const startup = vi.fn();
  const win = {
    addEventListener() {}, setTimeout, clearTimeout,
    location: { href: 'https://fictional.invalid/homa-ir.html' },
    sessionStorage: { getItem: key => key === 'vilda-vault-session-v2' ? 'fictional-session-present' : null },
    VildaSaveStatusIndicator: {},
    VildaVault: { isUnlocked: () => false, getCurrentUser: () => null },
    VildaAuthUI: { showStartupScreen: startup },
    document: {
      readyState: 'loading',
      documentElement: { classList: { contains: () => false } },
      getElementById() { return null; },
      addEventListener(type, callback) {
        if (!documentListeners.has(type)) documentListeners.set(type, []);
        documentListeners.get(type).push(callback);
      },
      dispatchEvent() {},
      querySelector(selector) {
        return existing.concat(appended).find(element => selector.includes((element.src || element.href).split('?')[0])) || null;
      },
      createElement(tag) {
        return { tagName: tag.toUpperCase(), listeners: {}, addEventListener(type, callback) { this.listeners[type] = callback; } };
      },
      head: {
        appendChild(element) {
          appended.push(element);
          queueMicrotask(() => {
            if (element.src?.startsWith('vilda_care_plans.js?')) win.VildaCarePlans = { mount() {} };
            element.listeners.load?.();
          });
        },
      },
    },
  };
  DEPENDENCIES.forEach(key => { win[key] = {}; });
  if (careReady) win.VildaCarePlans = { mount() {} };
  return {
    win, appended, startup,
    ready() { (documentListeners.get('DOMContentLoaded') || []).forEach(callback => callback({})); },
  };
}

function assertNewCareRequests(env) {
  expect(env.appended.map(element => element.src || element.href)).toEqual([
    expect.stringMatching(/^vilda_care_plans\.css\?v=\d+$/),
    expect.stringMatching(/^vilda_care_plans\.js\?v=\d+$/),
  ]);
  expect(env.win.VildaCarePlans.mount).toBeTypeOf('function');
}

// Execute the real header binder, including its private loader and real account
// click handler. Its enclosing DOM renderer is unrelated to dependency loading.
const chromeSource = fs.readFileSync(new URL('../../vilda_chrome.js', import.meta.url), 'utf8');
const binderStart = chromeSource.indexOf('function tt(');
const binderEnd = chromeSource.indexOf('/* P-CHROME-MENU:', binderStart);
const bindChrome = new Function('r', 'o', 'var K=false; ' + chromeSource.slice(binderStart, binderEnd) + '; return tt;');

function clickChromeAccount(env) {
  const handlers = {};
  const account = { addEventListener(type, callback) { handlers[type] = callback; } };
  const header = { querySelector: selector => selector === '#vildaUserAction' ? account : null };
  bindChrome(env.win, env.win.document)(header);
  handlers.click({});
}

describe('care plans dependency loading on already initialized auth pages', () => {
  it('session bridge explicitly loads the missing care CSS/JS and shares an in-flight load', async () => {
    const env = environment();
    loadBrowserScript('vilda_session_bridge.js', env.win);
    const pending = env.win.VildaSession.ensureAuthLoaded();
    expect(env.win.VildaSession.ensureAuthLoaded()).toBe(pending);
    await pending;
    assertNewCareRequests(env);
    await env.win.VildaSession.ensureAuthLoaded();
    expect(env.appended).toHaveLength(2);
  });

  it('session bridge does not load redundant assets when all dependencies are ready', async () => {
    const env = environment(true);
    loadBrowserScript('vilda_session_bridge.js', env.win);
    await env.win.VildaSession.ensureAuthLoaded();
    expect(env.appended).toEqual([]);
  });

  it('a known session automatically fills the missing care dependency on DOM readiness', async () => {
    const env = environment();
    loadBrowserScript('vilda_session_bridge.js', env.win);
    env.ready();
    await vi.waitFor(() => expect(env.win.VildaCarePlans?.mount).toBeTypeOf('function'));
    assertNewCareRequests(env);
  });

  it('a known session with care already ready performs no redundant auto-load', async () => {
    const env = environment(true);
    loadBrowserScript('vilda_session_bridge.js', env.win);
    env.ready();
    await Promise.resolve();
    expect(env.appended).toEqual([]);
  });

  it('the real chrome account action waits for missing care dependencies before opening auth', async () => {
    const env = environment();
    clickChromeAccount(env);
    expect(env.startup).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(env.startup).toHaveBeenCalledOnce());
    assertNewCareRequests(env);
  });

  it('the real chrome account action reuses fully loaded dependencies', async () => {
    const env = environment(true);
    clickChromeAccount(env);
    await vi.waitFor(() => expect(env.startup).toHaveBeenCalledOnce());
    expect(env.appended).toEqual([]);
  });
});
