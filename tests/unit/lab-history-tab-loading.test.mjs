import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// LAB-HISTORIA PR2 (P-BADANIA-CHROME): moduły zakładki „Badania” stoją w obu leniwych stosach auth — w moście sesji
// (lista V) i w vilda_chrome.js (lista d) — w tej samej kolejności, model przed widokiem. Strona bez tagów statycznych
// (np. przelicznik po ensureAuthLoaded) dostaje je razem z kartą; brak któregoś modułu dociąga tylko ten moduł.
const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const bridge = read('vilda_session_bridge.js');
const chrome = read('vilda_chrome.js');
const chromeStart = chrome.indexOf('var d=[{type:"css",href:"vilda_auth_ui.css');
const chromeEnd = chrome.indexOf('function l(){var f=r.VildaAuthUI', chromeStart);
if (chromeStart < 0 || chromeEnd < chromeStart) throw new Error('Production chrome auth loader not found');
const chromeLoader = chrome.slice(chromeStart, chromeEnd);

const LAB = ['vilda_lab_history.js', 'vilda_lab_history_tab.css', 'vilda_lab_history_tab.js'];
const files = (source, key) => [...source.matchAll(new RegExp(`${key}:"([^"?]+)\\?v=\\d+"`, 'g'))].map((m) => m[1]);

describe('stosy auth: moduły zakładki Badania', () => {
  const bridgeList = files(bridge.slice(bridge.indexOf('V=['), bridge.indexOf('],c=')), 'src');
  const chromeList = files(chromeLoader, 'href');

  it('most sesji i vilda_chrome.js ładują ten sam zestaw w tej samej kolejności', () => {
    expect(chromeList).toEqual(bridgeList);
  });

  it('model historii przed widokiem zakładki, oba przed sejfem i kartą', () => {
    for (const list of [bridgeList, chromeList]) {
      const at = (file) => list.indexOf(file);
      for (const file of LAB) expect(at(file), file).toBeGreaterThan(-1);
      expect(at('vilda_lab_history.js')).toBeLessThan(at('vilda_lab_history_tab.js'));
      expect(at('vilda_lab_history_tab.js')).toBeLessThan(at('vilda_vault.js'));
      expect(at('vilda_lab_history_tab.js')).toBeLessThan(at('vilda_auth_ui.js'));
      expect(at('vilda_puberty_assessment.js')).toBeGreaterThan(-1);
      expect(at('vilda_puberty_assessment.js')).toBeLessThan(at('vilda_auth_ui.js'));
    }
  });

  it('wersje modułów w obu stosach są równe wersjom z tagów stron', () => {
    const versions = (source) => Object.fromEntries([...source.matchAll(/(vilda_lab_history(?:_tab)?\.(?:js|css))\?v=(\d+)/g)].map((m) => [m[1], m[2]]));
    const index = versions(read('index.html'));
    expect(Object.keys(index).sort()).toEqual([...LAB].sort());
    expect(versions(bridge)).toEqual(index);
    expect(versions(chromeLoader)).toEqual(index);
  });
});

function environment(missing) {
  const appended = [];
  const win = { VildaCrypto: {}, VildaLabSnapshot: {}, VildaLabAssessmentUI: {}, VildaVault: {}, VildaAuthUI: {}, VildaProAccess: {},
    VildaHormoneReferenceSnapshot: {}, VildaHormoneReferenceUI: {}, VildaLabRangeSnapshot: {}, VildaLabHistory: {}, VildaLabHistoryTab: {}, VildaPubertyAssessment: {}, VildaLabTestosteroneUnits: {},
    // Independent care-plan readiness is tested in care-plans-loader.test.mjs.
    VildaCarePlans: {},
    sessionStorage: { getItem: () => null },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
  };
  for (const key of missing) delete win[key];
  const doc = {
    readyState: 'loading', querySelector: () => null, getElementById: () => null, addEventListener() {}, dispatchEvent() {},
    createElement(tag) {
      const handlers = new Map();
      return { tagName: tag, addEventListener(type, fn) { handlers.set(type, fn); }, loaded() { handlers.get('load')?.(); } };
    },
    head: { appendChild(node) {
      const url = node.src || node.href;
      appended.push(url);
      if (node.src) {
        const filename = node.src.split('?')[0];
        if (!['vilda_lab_history.js', 'vilda_lab_history_tab.js'].includes(filename)) throw new Error('Unexpected reload: ' + filename);
        loadBrowserScript(filename, win); // prawdziwe moduły: zła nazwa globalna albo błąd startu wyszłyby tutaj
      }
      node.loaded();
      return node;
    } },
  };
  win.document = doc;
  return { win, appended };
}

for (const loader of ['session', 'chrome']) {
  describe(`zakładka Badania: leniwy stos ${loader}`, () => {
    function start(env) {
      if (loader === 'session') {
        loadBrowserScript('vilda_session_bridge.js', env.win);
        return () => env.win.VildaSession.ensureAuthLoaded();
      }
      return new Function('r', 'o', `${chromeLoader}; return u;`)(env.win, env.win.document);
    }

    it('brak obu modułów: dociąga model, arkusz i widok w tej kolejności', async () => {
      const env = environment(['VildaLabHistory', 'VildaLabHistoryTab']);
      await start(env)();
      expect(env.appended.filter((url) => /vilda_lab_history/.test(url)).map((url) => url.split('?')[0])).toEqual(LAB);
      expect(typeof env.win.VildaLabHistory.buildHistoryView).toBe('function');
      expect(typeof env.win.VildaLabHistoryTab.render).toBe('function');
    });

    it('brak samego widoku: nie przeładowuje modelu', async () => {
      const env = environment(['VildaLabHistoryTab']);
      await start(env)();
      expect(env.appended.filter((url) => /^vilda_lab_history(_tab)?\.js\?v=\d+$/.test(url))).toEqual([expect.stringMatching(/^vilda_lab_history_tab\.js\?v=\d+$/)]);
    });

    it('wszystko gotowe: nic nie dokłada', async () => {
      const env = environment([]);
      await start(env)();
      expect(env.appended).toEqual([]);
    });
  });
}
