import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const read = file => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const chrome = read('vilda_chrome.js');
const chromeStart = chrome.indexOf('var d=[{type:"css",href:"vilda_auth_ui.css');
const chromeEnd = chrome.indexOf('function l(){var f=r.VildaAuthUI', chromeStart);
if (chromeStart < 0 || chromeEnd < chromeStart) throw new Error('Production chrome auth loader not found');
const chromeLoader = chrome.slice(chromeStart, chromeEnd);
const SGA = [
  ['VildaBirthAssessment', 'vilda_birth_assessment.js', 'read'],
  ['VildaPatientSgaModel', 'vilda_patient_sga_model.js', 'build'],
  ['VildaPatientSgaUI', 'vilda_patient_sga_ui.js', 'createTile']
];
const CSS = 'vilda_patient_sga_ui.css';
const readyGlobals = [
  'VildaCrypto', 'VildaLabSnapshot', 'VildaLabAssessmentUI', 'VildaVaultProtocol', 'VildaVault', 'VildaAuthUI', 'VildaProAccess',
  'VildaClinicalCrypto', 'VildaPatientCheckpointStore', 'VildaPatientCheckpoint', 'VildaPatientIdentityProtocol', 'VildaPatientIdentityTransport',
  'VildaHormoneReferenceSnapshot', 'VildaHormoneReferenceUI', 'VildaLabRangeSnapshot', 'VildaLabHistory', 'VildaLabResultPresentation', 'VildaLabResultChart', 'VildaLabHistoryTab',
  'VildaPubertyAssessment', 'VildaLabTestosteroneUnits', 'VildaCarePlanModel', 'VildaCarePlans', 'VildaRemindersPrivacy',
  'VildaGlobalSearch', 'VildaGlobalSearchView', 'VildaSearchNavigation', 'VildaPatientsList', 'VildaSaveStatusIndicator'
];
const existingCss = [
  'vilda_auth_ui.css', 'vilda_patients_list.css', 'vilda_lab_assessment_ui.css', 'vilda_lab_history_tab.css',
  'vilda_care_plans.css', 'vilda_global_search.css', 'vilda_reminders.css'
];

function environment(missing = SGA.map(([global]) => global), restoredSession = false, holdStylesheet = false) {
  const pendingStylesheet = [];
  const appended = [], events = new Map(), elements = existingCss.map(file => ({ href: file + '?v=existing' }));
  if (!missing.includes('VildaPatientSgaUI')) elements.push({ href: CSS + '?v=existing' });
  const win = Object.fromEntries(readyGlobals.map(global => [global, {}]));
  win.sessionStorage = { getItem: key => key === 'vilda-vault-session-v2' && restoredSession ? 'fictional-session' : null };
  win.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options?.detail; } };
  const doc = {
    readyState: 'loading', getElementById: () => null, dispatchEvent() {},
    querySelector(selector) { return elements.find(node => selector.includes((node.src || node.href).split('?')[0])) || null; },
    addEventListener(type, callback) { if (!events.has(type)) events.set(type, []); events.get(type).push(callback); },
    createElement(tag) {
      const listeners = new Map();
      return { tagName: tag, addEventListener(type, callback) { listeners.set(type, callback); }, loaded() { listeners.get('load')?.(); } };
    },
    head: { appendChild(node) {
      appended.push(node.src || node.href); elements.push(node);
      const finishLoad = () => {
        if (node.src) {
          const file = node.src.split('?')[0];
          expect(SGA.map(([, script]) => script)).toContain(file);
          if (file === 'vilda_patient_sga_model.js') expect(typeof win.VildaBirthAssessment?.read).toBe('function');
          if (file === 'vilda_patient_sga_ui.js') expect(typeof win.VildaPatientSgaModel?.build).toBe('function');
          // Execute each actual module: an incorrect filename/global/order cannot hide behind a placeholder.
          loadBrowserScript(file, win);
        }
        node.loaded();
      };
      if (holdStylesheet && node.href?.startsWith(CSS + '?')) pendingStylesheet.push(finishLoad);
      else queueMicrotask(finishLoad);
      return node;
    } }
  };
  win.document = doc;
  for (const [global, file] of SGA) if (!missing.includes(global)) loadBrowserScript(file, win);
  return { win, doc, appended, releaseStylesheet() { pendingStylesheet.splice(0).forEach(finish => finish()); }, ready() { (events.get('DOMContentLoaded') || []).forEach(callback => callback({})); } };
}

function start(loader, env) {
  if (loader === 'session') {
    loadBrowserScript('vilda_session_bridge.js', env.win);
    return () => env.win.VildaSession.ensureAuthLoaded();
  }
  return new Function('r', 'o', `${chromeLoader}; return u;`)(env.win, env.doc);
}
const filenames = env => env.appended.map(url => url.split('?')[0]);

for (const loader of ['session', 'chrome']) {
  describe(`patient SGA ${loader} loader with auth already initialized`, () => {
    it('loads only the missing SGA CSS, saved-assessment reader, model and view in dependency order', async () => {
      const env = environment(), ensure = start(loader, env);
      await ensure();
      expect(filenames(env)).toEqual([CSS, ...SGA.map(([, file]) => file)]);
      for (const [global, , method] of SGA) expect(typeof env.win[global][method]).toBe('function');
      expect(env.win.VildaBirthAssessment.read({})).toBeNull();
      expect(env.win.VildaPatientSgaModel.build({ weeks: '34', weight: '1650' })).toMatchObject({ value: 'Do oceny', hasAssessment: false });
      expect(env.win.VildaSgaBirth).toBeUndefined(); // Reading the card must not load the clinical calculator.
      const loaded = env.appended.slice();
      await ensure();
      expect(env.appended).toEqual(loaded);
    });

    it.each(SGA)('fills only missing %s while keeping the rest of the initialized auth stack', async (global, file, method) => {
      const env = environment([global]), ensure = start(loader, env);
      await ensure();
      expect(filenames(env)).toEqual(global === 'VildaPatientSgaUI' ? [CSS, file] : [file]);
      expect(typeof env.win[global][method]).toBe('function');
      const loaded = env.appended.slice();
      await ensure();
      expect(env.appended).toEqual(loaded);
    });

    it('performs no redundant requests when SGA and the rest of auth are already ready', async () => {
      const env = environment([]);
      await start(loader, env)();
      expect(env.appended).toEqual([]);
    });
  });
}

it('session bridge shares the pending SGA load and automatically supplies it for a restored session', async () => {
  const env = environment(undefined, true, true);
  start('session', env);
  env.ready();
  await vi.waitFor(() => expect(env.appended.length).toBeGreaterThan(0));
  const pending = env.win.VildaSession.ensureAuthLoaded();
  expect(env.win.VildaSession.ensureAuthLoaded()).toBe(pending);
  env.releaseStylesheet();
  await pending;
  expect(filenames(env)).toEqual([CSS, ...SGA.map(([, file]) => file)]);
  expect(typeof env.win.VildaPatientSgaUI.createTile).toBe('function');
});

it('both lazy stacks place the saved SGA reader, model and view before AuthUI, matching static versions', () => {
  const bridge = read('vilda_session_bridge.js');
  const expected = [CSS, ...SGA.map(([, file]) => file)];
  const urls = source => [...source.matchAll(/(?:src|href):"([^"?]+)\?v=(\d+)"/g)].map(match => ({ file: match[1], version: match[2] }));
  const staticVersions = Object.fromEntries([...read('index.html').matchAll(/(?:src|href)="([^"?]+)\?v=(\d+)"/g)].map(match => [match[1], match[2]]));
  for (const source of [chromeLoader, bridge.slice(bridge.indexOf('V=['), bridge.indexOf('],c='))]) {
    const assets = urls(source), names = assets.map(asset => asset.file);
    expect(names.filter(file => expected.includes(file))).toEqual(expected);
    for (const file of expected) {
      expect(names.indexOf(file)).toBeGreaterThan(-1);
      expect(names.indexOf(file)).toBeLessThan(names.indexOf('vilda_auth_ui.js'));
      expect(assets.find(asset => asset.file === file).version).toBe(staticVersions[file]);
    }
  }
});
