import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';

function environment() {
  const doc = atrapaDokumentu();
  doc.head = doc.documentElement.insertBefore(doc.createElement('head'), doc.body);
  doc.querySelectorAll = selector => doc.documentElement.querySelectorAll(selector);
  doc.currentScript = { src: 'https://fictional.invalid/application/clcr_record_resources.js?v=1' };
  const requests = [], win = { document: doc, location: { href: 'https://fictional.invalid/application/index.html', origin: 'https://fictional.invalid' }, setTimeout, clearTimeout };
  let failure = null;
  const append = doc.head.appendChild.bind(doc.head);
  doc.head.appendChild = node => {
    append(node);
    const url = new URL(node.getAttribute('src') || node.getAttribute('href'));
    const filename = url.pathname.split('/').pop();
    requests.push({ filename, tag: node.tagName });
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
  return { win, doc, requests, api: win.ClcrRecordResources, failNext: filename => { failure = filename; } };
}

describe('Klirens Notes lazy read resources', () => {
  it('loads the shared frozen readers and Notes view once, without any clinical engine or editor', async () => {
    const env = environment(), first = env.api.ensureNotes(), second = env.api.ensureNotes();
    expect(first).toBe(second);
    const view = await first;
    expect(typeof view.model).toBe('function');
    expect(typeof view.openDetails).toBe('function');
    const scripts = env.requests.filter(request => request.tag === 'SCRIPT').map(request => request.filename);
    expect(scripts).toEqual([...env.api.manifest.reader.map(([path]) => path.split('?')[0]), 'clcr_notes_view.js']);
    expect(env.requests.filter(request => request.tag === 'LINK').map(request => request.filename)).toEqual(['clcr_saved_results_view.css', 'clcr_notes_view.css']);
    for (const key of ['VildaClcrAcr', 'VildaClcrMgDzm', 'VildaClcrCaDzm', 'ClcrClinicalSafety', 'ClcrResultDetails', 'ClcrUiWorkflow']) expect(env.win[key]).toBeUndefined();
    const count = env.requests.length;
    await env.api.ensureNotes();
    expect(env.requests).toHaveLength(count);
    expect(env.doc.body.children).toHaveLength(0);
  });

  it('can retry a failed Notes view resource without duplicating the shared reader', async () => {
    const env = environment(); env.failNext('clcr_notes_view.js');
    await expect(env.api.ensureNotes()).rejects.toThrow('Nie można wczytać modułu clcr_notes_view.js.');
    expect(env.win.ClcrNotesView).toBeUndefined();
    await env.api.ensureNotes();
    expect(typeof env.win.ClcrNotesView.model).toBe('function');
    expect(env.requests.filter(request => request.filename === 'clcr_notes_view.js')).toHaveLength(2);
    expect(env.requests.filter(request => request.filename === 'clcr_saved_results.js')).toHaveLength(1);
    expect(env.requests.filter(request => request.filename === 'clcr_notes_view.css')).toHaveLength(1);
  });
});
