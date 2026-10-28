import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';

const read = filename => readFileSync(new URL('../../' + filename, import.meta.url), 'utf8');
const identity = path => new URL(path, 'https://fictional.invalid/application/').pathname.split('/').pop();
const mgScripts = ['clcr_mg_dzm_reference_data.js', 'clcr_mg_dzm.js', 'clcr_mg_dzm_ui.js', 'clcr_mg_dzm_persistence.js'];
const newAssets = ['clcr_collection_duration.js', 'clcr_collection_duration.css', ...mgScripts,
  'clcr_mg_dzm_ui.css', 'clcr_notes_view.js', 'clcr_notes_view.css'];
function before(list, first, second) {
  expect(list, first + ' exists').toContain(first);
  expect(list, second + ' exists').toContain(second);
  expect(list.indexOf(first), first + ' before ' + second).toBeLessThan(list.indexOf(second));
}
// Deliberately bypass loadBrowserScript's dependency injection. Only the actual
// production manifest may supply dependencies; a test helper must not repair it.
function execute(filename, win) {
  new Function('window', 'globalThis', read(filename))(win, win);
}
function resourceEnvironment() {
  const doc = atrapaDokumentu();
  doc.head = doc.documentElement.insertBefore(doc.createElement('head'), doc.body);
  doc.querySelectorAll = selector => doc.documentElement.querySelectorAll(selector);
  doc.currentScript = { src: 'https://fictional.invalid/application/clcr_record_resources.js?v=1' };
  const requests = [], failures = [], win = { document: doc, location: { href: 'https://fictional.invalid/application/index.html', origin: 'https://fictional.invalid' }, setTimeout, clearTimeout };
  const append = doc.head.appendChild.bind(doc.head);
  doc.head.appendChild = node => {
    append(node);
    const url = new URL(node.getAttribute('src') || node.getAttribute('href'));
    const filename = identity(url.href);
    requests.push({ filename, url: url.href, tag: node.tagName });
    queueMicrotask(() => {
      try {
        if (node.tagName === 'LINK') node.sheet = {};
        else {
          if (filename === 'clcr_saved_calculation.js') expect(typeof win.ClcrMgDzmPersistence?.readSnapshot).toBe('function');
          if (filename === 'clcr_notes_view.js') expect(typeof win.ClcrSavedResults?.projectPatientNotes).toBe('function');
          if (filename === 'clcr_mg_dzm.js') {
            expect(typeof win.ClcrCollectionDuration?.fromValues).toBe('function');
            expect(win.ClcrMgDzmReferenceData?.DEFAULT_POLICY).toBeTruthy();
            expect(typeof win.ClcrExtendedEgfr?.computeHaycockBsa).toBe('function');
          }
          const previous = doc.currentScript;
          doc.currentScript = { src: url.href };
          execute(filename, win);
          doc.currentScript = previous;
        }
        node.dispatch('load');
      } catch (error) { failures.push(error); node.dispatch('error'); }
    });
    return node;
  };
  execute('clcr_record_resources.js', win);
  return { win, doc, requests, ensure: promise => promise.catch(error => { throw failures[0] || error; }), scripts: () => requests.filter(request => request.tag === 'SCRIPT').map(request => request.filename) };
}

describe('Mg DZM, shared duration and Notes — production resource integration', () => {
  it('loads deferred duration and the Mg stack before their calculator consumers', () => {
    const html = read('kalkulator-klirens.html');
    const tags = [...html.matchAll(/<script\b([^>]*?)\bsrc=["']([^"']+)["']([^>]*)>/gi)]
      .map(match => ({ filename: identity(match[2]), attrs: match[1] + match[3] }));
    const scripts = tags.map(tag => tag.filename);
    for (const name of ['clcr_collection_duration.js', ...mgScripts]) {
      expect(tags.filter(tag => tag.filename === name), name + ' loads exactly once').toHaveLength(1);
      const tag = tags.find(tag => tag.filename === name);
      expect(tag.attrs).toMatch(/\bdefer\b/);
      expect(tag.attrs).not.toMatch(/\basync\b/);
      before(scripts, name, 'clcr_ui_workflow.js');
    }
    before(scripts, 'clcr_collection_duration.js', 'inline_kalkulator_klirens_04.js');
    before(scripts, 'clcr_collection_duration.js', 'clcr_mg_dzm.js');
    before(scripts, 'clcr_extended_egfr.js', 'clcr_mg_dzm.js');
    before(scripts, 'clcr_mg_dzm_reference_data.js', 'clcr_mg_dzm.js');
    before(scripts, 'clcr_mg_dzm.js', 'clcr_mg_dzm_ui.js');
    before(scripts, 'clcr_mg_dzm_ui.js', 'inline_kalkulator_klirens_04.js');
    before(scripts, 'clcr_mg_dzm_persistence.js', 'clcr_saved_calculation.js');
    const styles = [...html.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)].map(match => identity(match[1]));
    for (const name of ['clcr_mg_dzm_ui.css', 'clcr_collection_duration.css']) expect(styles.filter(path => path === name)).toHaveLength(1);
  });

  it('reads Mg snapshots and Notes without loading a clinical engine or editor', async () => {
    const env = resourceEnvironment();
    await env.ensure(env.win.ClcrRecordResources.ensureReader());
    expect(typeof env.win.ClcrMgDzmPersistence?.readSnapshot).toBe('function');
    await env.ensure(env.win.ClcrRecordResources.ensureNotes());
    expect(typeof env.win.ClcrNotesView?.model).toBe('function');
    before(env.scripts(), 'clcr_mg_dzm_persistence.js', 'clcr_saved_calculation.js');
    before(env.scripts(), 'clcr_saved_results.js', 'clcr_notes_view.js');
    const forbidden = ['clcr_collection_duration.js', 'clcr_mg_dzm_reference_data.js', 'clcr_mg_dzm.js', 'clcr_mg_dzm_ui.js',
      'clcr_result_details.js', 'inline_kalkulator_klirens_04.js', 'clcr_ui_workflow.js'];
    for (const name of forbidden) expect(env.scripts()).not.toContain(name);
    for (const key of ['VildaClcrMgDzm', 'ClcrClinicalSafety', 'ClcrResultDetails', 'ClcrUiWorkflow']) expect(env.win[key]).toBeUndefined();
    const count = env.requests.length;
    await Promise.all([env.win.ClcrRecordResources.ensureReader(), env.win.ClcrRecordResources.ensureNotes()]);
    expect(env.requests).toHaveLength(count);
    expect(env.doc.body.children).toHaveLength(0);
  });

  it('loads actual Mg edit dependencies in order and computes a reference with no injected modules', async () => {
    const env = resourceEnvironment();
    await env.ensure(env.win.ClcrRecordResources.ensureEditor());
    const scripts = env.scripts();
    before(scripts, 'clcr_collection_duration.js', 'clcr_mg_dzm.js');
    before(scripts, 'clcr_extended_egfr.js', 'clcr_mg_dzm.js');
    before(scripts, 'clcr_mg_dzm_reference_data.js', 'clcr_mg_dzm.js');
    before(scripts, 'clcr_mg_dzm.js', 'clcr_saved_legacy_calculator.js');
    before(scripts, 'clcr_mg_dzm.js', 'clcr_result_details.js');
    const result = env.win.VildaClcrMgDzm.evaluate({ concentration: '20', volume: '1500', weightKg: '30', heightCm: '135', ageYears: 10 }, env.win.ClcrMgDzmReferenceData.DEFAULT_POLICY);
    expect(result).toMatchObject({ valid: true, bsaMethod: 'Haycock', unit: 'mg/1,73 m²/24 h', referenceAvailable: true });
    expect(typeof env.win.ClcrResultDetails?.open).toBe('function');
    for (const name of ['clcr_mg_dzm_ui.js', 'inline_kalkulator_klirens_04.js', 'clcr_ui_workflow.js']) expect(scripts).not.toContain(name);
    expect(env.doc.body.children).toHaveLength(0);
  });

  it('precaches every new Mg, duration and Notes asset at its production v1 URL', () => {
    const self = { location: new URL('https://fictional.invalid/service-worker-kalorii.js'), registration: {}, clients: { claim: async () => {} }, addEventListener() {}, skipWaiting() {} };
    const urls = new Function('self', 'caches', 'fetch', read('service-worker-kalorii.js') + '\nreturn PRECACHE_URLS;')(self, null, null);
    for (const name of newAssets) expect(urls, name).toContain('/' + name + '?v=1');
  });
});
