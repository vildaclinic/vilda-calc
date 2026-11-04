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

const MODULES = [
  ['VildaLabHistory', 'vilda_lab_history.js', 'buildHistoryView'],
  ['VildaLabResultPresentation', 'vilda_lab_result_presentation.js', 'describe'],
  ['VildaLabResultChart', 'vilda_lab_result_chart.js', 'render'],
  ['VildaLabHistoryTab', 'vilda_lab_history_tab.js', 'render'],
];
const LAB = ['vilda_lab_history.js', 'vilda_lab_history_tab.css', 'vilda_lab_result_presentation.js', 'vilda_lab_result_chart.js', 'vilda_lab_history_tab.js'];
const files = (source, key) => [...source.matchAll(new RegExp(`${key}:"([^"?]+)\\?v=\\d+"`, 'g'))].map((m) => m[1]);
const indexAssets = [...read('index.html').matchAll(/\b(?:src|href)="([^"]+\?v=\d+)"/g)].map((match) => match[1]);
function assetUrl(file) {
  const url = indexAssets.find((candidate) => candidate.split('?')[0] === file);
  if (!url) throw new Error('Production index does not load ' + file);
  return url;
}

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
      expect(at('vilda_lab_result_presentation.js')).toBeLessThan(at('vilda_lab_result_chart.js'));
      expect(at('vilda_lab_result_chart.js')).toBeLessThan(at('vilda_lab_history_tab.js'));
      expect(at('vilda_lab_history_tab.js')).toBeLessThan(at('vilda_vault.js'));
      expect(at('vilda_lab_history_tab.js')).toBeLessThan(at('vilda_auth_ui.js'));
      expect(at('vilda_puberty_assessment.js')).toBeGreaterThan(-1);
      expect(at('vilda_puberty_assessment.js')).toBeLessThan(at('vilda_auth_ui.js'));
    }
  });

  it('wersje modułów w obu stosach są równe wersjom z tagów stron', () => {
    const versions = (source) => Object.fromEntries([...source.matchAll(/(vilda_lab_(?:history(?:_tab)?\.(?:js|css)|result_(?:presentation|chart)\.js))\?v=(\d+)/g)].map((m) => [m[1], m[2]]));
    const index = versions(read('index.html'));
    expect(Object.keys(index).sort()).toEqual([...LAB].sort());
    for (const page of ['app.html', 'docpro.html', 'kalkulator-klirens.html', 'notatki.html', 'subskrypcja.html', 'terminarz.html', 'ustawienia.html']) {
      expect(versions(read(page)), page).toEqual(index);
    }
    expect(versions(bridge)).toEqual(index);
    expect(versions(chromeLoader)).toEqual(index);
  });

  it('każda strona z zakładką ładuje prezentację i wykres przed widokiem, a oba nowe pliki są w precache', () => {
    for (const page of ['index.html', 'app.html', 'docpro.html', 'kalkulator-klirens.html', 'notatki.html', 'subskrypcja.html', 'terminarz.html', 'ustawienia.html']) {
      const source = read(page);
      const presentation = source.indexOf('vilda_lab_result_presentation.js?');
      const chart = source.indexOf('vilda_lab_result_chart.js?');
      const tab = source.indexOf('vilda_lab_history_tab.js?');
      expect(presentation, page).toBeGreaterThan(-1);
      expect(chart, page).toBeGreaterThan(presentation);
      expect(tab, page).toBeGreaterThan(chart);
    }
    const worker = read('service-worker-kalorii.js');
    for (const [, file] of MODULES.slice(1, 3)) expect(worker).toContain(`'/${assetUrl(file)}'`);
  });
});

function environment(missing) {
  const appended = [];
  const win = { VildaCrypto: {}, VildaLabSnapshot: {}, VildaLabAssessmentUI: {}, VildaVaultProtocol: {}, VildaVault: {}, VildaAuthUI: {}, VildaProAccess: {},
    VildaClinicalCrypto: {}, VildaPatientCheckpointStore: {}, VildaPatientCheckpoint: {},
    VildaPatientIdentityProtocol: {}, VildaPatientIdentityTransport: {},
    // SGA readiness has its own missing-dependency cases in patient-sga-loading.test.mjs.
    VildaBirthAssessment: {}, VildaPatientSgaModel: {}, VildaPatientSgaUI: {},
    VildaHormoneReferenceSnapshot: {}, VildaHormoneReferenceUI: {}, VildaLabRangeSnapshot: {}, VildaLabHistory: {}, VildaLabResultPresentation: {}, VildaLabResultChart: {}, VildaLabHistoryTab: {}, VildaPubertyAssessment: {}, VildaLabTestosteroneUnits: {},
    // Independent care-plan model/UI readiness is tested in care-plans-loader.test.mjs.
    VildaCarePlanModel: {}, VildaCarePlans: {},
    // Independent search/privacy readiness is covered by the same loader suite.
    VildaRemindersPrivacy: {}, VildaGlobalSearch: {}, VildaGlobalSearchView: {}, VildaSearchNavigation: {}, VildaPatientsList: {},
    sessionStorage: { getItem: () => null },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
  };
  for (const key of missing) delete win[key];
  const doc = {
    readyState: 'loading', querySelector: selector => selector.includes('vilda_patient_sga_ui.css') ? { href: 'vilda_patient_sga_ui.css?v=existing' } : null, getElementById: () => null, addEventListener() {}, dispatchEvent() {},
    createElement(tag) {
      const handlers = new Map();
      return { tagName: tag, addEventListener(type, fn) { handlers.set(type, fn); }, loaded() { handlers.get('load')?.(); } };
    },
    head: { appendChild(node) {
      const url = node.src || node.href;
      appended.push(url);
      if (node.src) {
        const filename = node.src.split('?')[0];
        if (!MODULES.some(([, file]) => file === filename)) throw new Error('Unexpected reload: ' + filename);
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

    it('brak modułów: dociąga model, arkusz, prezentację norm, wykres i widok w tej kolejności', async () => {
      const env = environment(MODULES.map(([global]) => global));
      await start(env)();
      expect(env.appended.filter((url) => /vilda_lab_(history|result)/.test(url)).map((url) => url.split('?')[0])).toEqual(LAB);
      expect(typeof env.win.VildaLabHistory.buildHistoryView).toBe('function');
      expect(typeof env.win.VildaLabHistoryTab.render).toBe('function');
    });

    for (const [global, file, method] of MODULES.slice(1, 3)) {
      it(`brak ${global}: uzupełnia zależność nawet przy już załadowanej zakładce`, async () => {
        const env = environment([global]);
        await start(env)();
        expect(env.appended.filter((url) => MODULES.some(([, candidate]) => url.split('?')[0] === candidate))).toEqual([assetUrl(file)]);
        expect(typeof env.win[global][method]).toBe('function');
        expect(env.appended.some((url) => url.startsWith('vilda_lab_history_tab.js?'))).toBe(false);
      });
    }

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
