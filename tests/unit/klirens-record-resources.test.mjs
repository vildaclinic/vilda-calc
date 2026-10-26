import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';

// DOM/network adapter executes the actual requested production file, then emits
// load. No server, browser profile, patient data, password or real vault.
function environment() {
  const doc = atrapaDokumentu();
  doc.head = doc.documentElement.insertBefore(doc.createElement('head'), doc.body);
  doc.querySelectorAll = (selector) => doc.documentElement.querySelectorAll(selector);
  doc.currentScript = { src: 'https://fictional.invalid/application/clcr_record_resources.js?v=1' };
  const requests = [], win = { document: doc, location: { href: 'https://fictional.invalid/application/index.html', origin: 'https://fictional.invalid' }, setTimeout, clearTimeout };
  let failure = null;
  const append = doc.head.appendChild.bind(doc.head);
  doc.head.appendChild = (node) => {
    append(node);
    const url = new URL(node.getAttribute('src') || node.getAttribute('href'));
    const filename = url.pathname.split('/').pop();
    requests.push({ filename, url: url.href, tag: node.tagName });
    queueMicrotask(() => {
      if (failure === filename) { failure = null; node.dispatch('error'); return; }
      if (node.tagName === 'LINK') node.sheet = {};
      else {
        const previous = doc.currentScript;
        doc.currentScript = { src: url.href };
        loadBrowserScript(filename, win);
        doc.currentScript = previous;
      }
      node.dispatch('load');
    });
    return node;
  };
  loadBrowserScript('clcr_record_resources.js', win);
  return { win, doc, requests, api: win.ClcrRecordResources, failNext: (filename) => { failure = filename; } };
}

describe('lazy resources zapisanych obliczeń', () => {
  it('czytnik ładuje tylko własne pure zależności, w kolejności i jeden raz dla równoległych kart', async () => {
    const env = environment();
    expect(env.requests).toHaveLength(0);
    const first = env.api.ensureReader(), second = env.api.ensureReader();
    expect(first).toBe(second);
    const modules = await first;
    expect(typeof modules.reader.projectPatientNotes).toBe('function');
    expect(typeof modules.view.render).toBe('function');
    expect(env.requests.filter((request) => request.tag === 'SCRIPT').map((request) => request.filename))
      .toEqual(env.api.manifest.reader.map(([path]) => path.split('?')[0]));
    expect(env.requests.every((request) => request.url.startsWith('https://fictional.invalid/application/'))).toBe(true);
    expect(env.win.VildaClcrAcr).toBeUndefined();
    expect(env.win.ClcrClinicalSafety).toBeUndefined();
    expect(env.win.ClcrUiWorkflow).toBeUndefined();
    const count = env.requests.length;
    await env.api.ensureReader();
    expect(env.requests).toHaveLength(count);
    expect(env.doc.body.children).toHaveLength(0);
  });

  it('edycja dodaje rzeczywiste silniki i szczegóły bez ładowania strony ani DOM workflow', async () => {
    const env = environment();
    const details = await env.api.ensureEditor();
    expect(typeof details.open).toBe('function');
    expect(typeof env.win.ClcrSavedLegacyCalculator.recalculate).toBe('function');
    expect(typeof env.win.VildaClcrFehco3.evaluate).toBe('function');
    expect(typeof env.win.VildaClcrAcr.evaluate).toBe('function');
    const scripts = env.requests.filter((request) => request.tag === 'SCRIPT').map((request) => request.filename);
    expect(scripts).toEqual([...env.api.manifest.reader, ...env.api.manifest.editor].map(([path]) => path.split('?')[0]));
    expect(scripts).not.toContain('inline_kalkulator_klirens_04.js');
    expect(scripts).not.toContain('clcr_ui_workflow.js');
    expect(scripts.filter((name) => /_ui\.js$/.test(name))).toHaveLength(0);
    expect(env.doc.body.children).toHaveLength(0);
    expect(env.requests.filter((request) => request.tag === 'LINK').map((request) => request.filename))
      .toEqual(['clcr_saved_results_view.css', 'clcr_result_details.css']);
  });

  it('błąd zasobu nie staje się gotowością; ponowienie wczytuje brakujący plik bez duplikowania poprzednich', async () => {
    const env = environment();
    env.failNext('clcr_fena_persistence.js');
    await expect(env.api.ensureReader()).rejects.toThrow('Nie można wczytać modułu clcr_fena_persistence.js.');
    expect(env.win.ClcrSavedResults).toBeUndefined();
    await env.api.ensureReader();
    expect(typeof env.win.ClcrSavedResults.projectPatientNotes).toBe('function');
    expect(env.requests.filter((request) => request.filename === 'clcr_oxcr_persistence.js')).toHaveLength(1);
    expect(env.requests.filter((request) => request.filename === 'clcr_fena_persistence.js')).toHaveLength(2);
    expect(env.doc.head.querySelectorAll('script').filter((node) => node.getAttribute('src').includes('clcr_fena_persistence.js'))).toHaveLength(1);
  });
});
