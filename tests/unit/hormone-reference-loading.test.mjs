import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const chrome = readFileSync(new URL('../../vilda_chrome.js', import.meta.url), 'utf8');
// Execute the existing production loader block, without mounting unrelated menus.
const chromeStart = chrome.indexOf('var d=[{type:"css",href:"vilda_auth_ui.css');
const chromeEnd = chrome.indexOf('function l(){var f=r.VildaAuthUI', chromeStart);
if (chromeStart < 0 || chromeEnd < chromeStart) throw new Error('Production chrome auth loader not found');
const chromeLoader = chrome.slice(chromeStart, chromeEnd);

function environment(missing = [], restoredSession = false) {
  const events = new Map(), appended = [];
  const win = { VildaCrypto: {}, VildaLabSnapshot: {}, VildaLabAssessmentUI: {}, VildaVault: {},
    VildaAuthUI: {}, VildaProAccess: {}, VildaHormoneReferenceSnapshot: {}, VildaHormoneReferenceUI: {},
    // LAB-HISTORIA PR2: moduły zakładki „Badania” są w tym samym stosie; tu gotowe (ich ładowanie: lab-history-tab-loading).
    VildaLabHistory: {}, VildaLabHistoryTab: {}, VildaPubertyAssessment: {}, VildaLabTestosteroneUnits: {},
    sessionStorage: { getItem: key => key === 'vilda-vault-session-v2' && restoredSession ? 'fictional-session' : null },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
  };
  for (const key of missing) delete win[key];
  const doc = {
    readyState: 'loading', querySelector: () => null, getElementById: () => null,
    addEventListener(type, fn) { events.set(type, fn); }, dispatchEvent() {},
    createElement(tag) {
      const handlers = new Map();
      return { tagName: tag, addEventListener(type, fn) { handlers.set(type, fn); },
        loaded() { handlers.get('load')?.(); } };
    },
    head: { appendChild(node) {
      appended.push(node.src || node.href);
      if (node.src) {
        const filename = node.src.split('?')[0];
        // The new modules really execute; loading placeholders would conceal an
        // incorrect global name, dependency order, or initialization failure.
        if (!['vilda_hormone_reference_snapshot.js', 'vilda_hormone_reference_ui.js'].includes(filename)
          && !(filename === 'vilda_lab_testosterone_units.js' && missing.includes('VildaLabTestosteroneUnits'))
          && !(filename === 'vilda_lab_snapshot.js' && missing.includes('VildaLabSnapshot'))
          && !(filename === 'vilda_puberty_assessment.js' && missing.includes('VildaPubertyAssessment'))) {
          throw new Error('Unexpected reload of an already available module: ' + filename);
        }
        if (filename === 'vilda_hormone_reference_ui.js') expect(win.VildaHormoneReferenceSnapshot).toBeTruthy();
        if (filename === 'vilda_lab_snapshot.js') expect(win.VildaLabTestosteroneUnits?.id).toBe('tt-existing-mass-conversions');
        loadBrowserScript(filename, win);
      }
      node.loaded();
      return node;
    } },
  };
  win.document = doc;
  return { win, doc, events, appended };
}

const helpers = ['VildaHormoneReferenceSnapshot', 'VildaHormoneReferenceUI'];
const missingCases = [helpers, [helpers[0]], [helpers[1]]];

for (const loader of ['session', 'chrome']) {
  describe(`AMH reference ${loader} lazy loader`, () => {
    function start(env) {
      if (loader === 'session') {
        loadBrowserScript('vilda_session_bridge.js', env.win);
        return () => env.win.VildaSession.ensureAuthLoaded();
      }
      return new Function('r', 'o', `${chromeLoader}; return u;`)(env.win, env.doc);
    }
    it.each(missingCases.map(missing => [missing.join(' + '), missing]))('loads missing %s even though old auth/vault/snapshot globals are ready', async (_, missing) => {
      const env = environment(missing), ensure = start(env);
      await ensure();
      const scripts = env.appended.filter(src => src.endsWith('.js?v=1'));
      const expected = missing.map(name => name === helpers[0] ? 'vilda_hormone_reference_snapshot.js?v=1' : 'vilda_hormone_reference_ui.js?v=1');
      expect(scripts).toEqual(expected);
      expect(env.win.VildaHormoneReferenceSnapshot).toBeTruthy();
      expect(env.win.VildaHormoneReferenceUI).toBeTruthy();
      if (missing.includes(helpers[0])) expect(typeof env.win.VildaHormoneReferenceSnapshot.normalize).toBe('function');
      if (missing.includes(helpers[1])) expect(typeof env.win.VildaHormoneReferenceUI.render).toBe('function');
      const loads = env.appended.length;
      await ensure();
      expect(env.appended).toHaveLength(loads);
    });

    it('does not append assets when all globals are already ready', async () => {
      const env = environment();
      await start(env)();
      expect(env.appended).toEqual([]);
    });

    it('loads the typed puberty reader once when it is the only missing dependency', async () => {
      const env = environment(['VildaPubertyAssessment']);
      const ensure = start(env);
      await ensure();
      expect(env.appended.filter(url => /\.js\?/.test(url))).toEqual([
        expect.stringMatching(/^vilda_puberty_assessment\.js\?v=\d+$/),
      ]);
      expect(env.win.VildaPubertyAssessment.readUser({ tannerStage: 4 })).toMatchObject({
        status: 'absent', legacy: { kind: 'unspecified', stage: 4 },
      });
      const loads = env.appended.length;
      await ensure();
      expect(env.appended).toHaveLength(loads);
    });

    it('loads the immutable TT units before the snapshot without loading clinical tables or an engine', async () => {
      const env = environment(['VildaLabTestosteroneUnits', 'VildaLabSnapshot']);
      const ensure = start(env);
      await ensure();
      expect(env.appended.filter(url => /\.js\?/.test(url)).map(url => url.split('?')[0])).toEqual([
        'vilda_lab_testosterone_units.js', 'vilda_lab_snapshot.js',
      ]);
      expect(env.win.VildaLabTestosteroneUnits.factorToCanonical['ng/dL']).toBe(0.03467);
      expect(typeof env.win.VildaLabSnapshot.normalize).toBe('function');
      expect(env.win.VildaLabTestosteroneData).toBeUndefined();
      expect(env.win.VildaLabTestosterone).toBeUndefined();
      const loads = env.appended.length;
      await ensure();
      expect(env.appended).toHaveLength(loads);
    });
  });
}

it('restored-session bootstrap loads missing AMH helpers before reporting auth ready', async () => {
  const env = environment(helpers, true);
  loadBrowserScript('vilda_session_bridge.js', env.win);
  expect(env.events.get('DOMContentLoaded')).toBeTypeOf('function');
  env.events.get('DOMContentLoaded')();
  await env.win.VildaSession.ensureAuthLoaded();
  expect(env.appended.filter(src => src.endsWith('.js?v=1'))).toEqual([
    'vilda_hormone_reference_snapshot.js?v=1', 'vilda_hormone_reference_ui.js?v=1',
  ]);
  expect(typeof env.win.VildaHormoneReferenceSnapshot.normalize).toBe('function');
  expect(typeof env.win.VildaHormoneReferenceUI.render).toBe('function');
});
