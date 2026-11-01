import fs from 'node:fs';
import vm from 'node:vm';
import { setImmediate as settle } from 'node:timers/promises';
import { describe, expect, it, vi } from 'vitest';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';

const source = fs.readFileSync(new URL('../../vilda_global_search_view.js', import.meta.url), 'utf8');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
};
const noteId = index => 'note:fictional-return-' + index;
const records = (count = 120, suffix = '') => Array.from({ length: count }, (_, index) => ({
  id: noteId(index), noteId: 'fictional-return-' + index, kind: 'event', label: 'Wydarzenie',
  title: 'Fikcyjny wpis ' + index, patientId: 'fictional-return-patient', patientName: 'Fikcyjny Nowak', statusLabel: 'Do wykonania',
  eventDateISO: '2027-02-02', dueDateISO: '2027-02-02',
  body: ('Fikcyjny długi opis ' + index + '. ').repeat(100) + suffix,
  source: { dueDateISO: '2027-02-02', category: 'followup', secretFixtureData: 'Not a UI snapshot' },
}));

function environment({ full = true, mobile = true, rows = records() } = {}) {
  const doc = atrapaDokumentu(), create = doc.createElement;
  const documentListeners = new Map();
  doc.addEventListener = (type, callback) => {
    if (!documentListeners.has(type)) documentListeners.set(type, new Set());
    documentListeners.get(type).add(callback);
  };
  doc.removeEventListener = (type, callback) => documentListeners.get(type)?.delete(callback);
  doc.dispatchEvent = event => {
    [...(documentListeners.get(event.type) || [])].forEach(callback => callback(event));
    return true;
  };
  doc.createElement = tag => {
    const node = create(tag);
    node.dataset = new Proxy({}, { set(target, key, value) {
      target[key] = String(value);
      node.setAttribute('data-' + key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase()), value);
      return true;
    } });
    let scroll = 0;
    const maximum = () => {
      if (node.classList.contains('vgs-list')) return Math.max(0, node.querySelectorAll('.vgs-row').length * 100 - 500);
      if (node.classList.contains('vgs-detail')) return node.querySelector('.vb22-body') ? 5000 : 0;
      return 0;
    };
    Object.defineProperties(node, {
      childNodes: { get: () => node.children },
      scrollTop: { get: () => scroll, set: value => { scroll = Math.min(maximum(), Math.max(0, Number(value) || 0)); } },
      scrollHeight: { get: () => maximum() + 500 },
      clientHeight: { get: () => 500 },
    });
    const remove = node.removeChild.bind(node);
    node.removeChild = child => {
      const lostFocus = child.contains(doc.activeElement);
      const result = remove(child);
      scroll = Math.min(scroll, maximum());
      if (lostFocus) doc.activeElement = doc.body;
      return result;
    };
    node.focus = () => {
      doc.activeElement = node; node.dispatch('focusin');
      doc.dispatchEvent({ type: 'focusin', target: node });
    };
    node.matches = selector => doc.documentElement.querySelectorAll(selector).includes(node);
    node.closest = selector => {
      for (let cursor = node; cursor; cursor = cursor.parentNode) if (cursor.matches?.(selector)) return cursor;
      return null;
    };
    return node;
  };
  doc.activeElement = doc.body;
  const host = doc.body.appendChild(doc.createElement('div'));
  const status = { unlocked: true, userId: 'fictional-return-account', current: true, epoch: 1 };
  const ownerEpoch = status.epoch;
  const vault = {
    isUnlocked: () => status.unlocked,
    getCurrentUser: () => ({ userId: status.userId }),
    ACTIVITY_PATIENT_ID: '__vilda_activity__', EXTERNAL_PATIENT_ID: '__vilda_external__',
  };
  const service = { search: vi.fn(async () => rows), invalidate: vi.fn(), destroy: vi.fn() };
  const timers = new Map(); let serial = 0, serviceOptions;
  const win = {
    document: doc, VildaGlobalSearch: { create: options => { serviceOptions = options; return service; } },
    matchMedia: () => ({ matches: mobile }),
    setTimeout: callback => { timers.set(++serial, callback); return serial; }, clearTimeout: id => timers.delete(id),
  };
  vm.runInNewContext(source, { window: win });
  const options = { full, vault, isCurrent: () => status.current && status.epoch === ownerEpoch,
    requestExpand: vi.fn(), openPatient: vi.fn(), openCalendar: vi.fn(), openReminder: vi.fn() };
  const view = win.VildaGlobalSearchView.mount(host, options);
  return { doc, host, status, view, service, options,
    invalidate: reason => serviceOptions.onInvalidate(reason),
    flush: async () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(callback => callback()); await settle(); },
    list: () => host.querySelector('.vgs-list'), detail: () => host.querySelector('.vgs-detail'),
    row: id => host.querySelectorAll('[data-search-id]').find(node => node.dataset.searchId === id),
    listenerCount: type => documentListeners.get(type)?.size || 0,
  };
}

async function selectedBeyondFirstPage(e) {
  await e.view.request({ query: 'Nowak', time: 'future', status: 'open' });
  e.host.querySelector('.vgs-more').click();
  expect(e.host.querySelectorAll('.vgs-row')).toHaveLength(100);
  e.list().scrollTop = 4800;
  e.view.select(noteId(80));
  if (e.detail()) e.detail().scrollTop = 1300;
}

function restoredSnapshot(extra = {}) {
  return { version: 1, query: 'Nowak', time: 'future', status: 'open', id: noteId(80), mode: 'detail', limit: 100,
    listScrollTop: 4800, detailScrollTop: 1300,
    origin: { query: 'Nowak', time: 'future', status: 'open', id: noteId(80), limit: 100, listScrollTop: 4800 },
    focus: null, ...extra };
}

describe('Search UI return snapshots use the production view', () => {
  it('exports a detached versioned scalar snapshot and never transports the clinical search index', async () => {
    const e = environment();
    await selectedBeyondFirstPage(e);
    const snapshot = e.view.getContext();
    expect(Object.keys(snapshot).sort()).toEqual(['version', 'query', 'time', 'status', 'id', 'mode', 'limit', 'listScrollTop', 'detailScrollTop', 'origin', 'focus'].sort());
    const expected = restoredSnapshot(); delete expected.focus;
    expect(snapshot).toMatchObject(expected);
    expect(snapshot.focus === null || typeof snapshot.focus === 'string').toBe(true);
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toMatch(/secretFixtureData|Not a UI snapshot|Fikcyjny długi opis|ownerDocument|"rows"|"source"/);
    expect(JSON.parse(serialized)).toEqual(snapshot);
    snapshot.origin.listScrollTop = 7;
    snapshot.query = 'Changed only in the exported copy';
    expect(e.view.getContext()).toMatchObject({ query: 'Nowak', origin: { listScrollTop: 4800 } });
  });

  it('restores a fresh detail view past row50, both scrolls and its original list context', async () => {
    const first = environment();
    await selectedBeyondFirstPage(first);
    const snapshot = JSON.parse(JSON.stringify(first.view.getContext()));
    first.view.destroy();
    expect(first.listenerCount('focusin')).toBe(0);
    expect(first.listenerCount('pointerdown')).toBe(0);
    const restored = environment();
    await restored.view.request(snapshot);
    expect(restored.service.search).toHaveBeenCalledExactlyOnceWith('Nowak', { time: 'future', status: 'open' });
    expect(restored.host.querySelectorAll('.vgs-row')).toHaveLength(100);
    expect(restored.row(noteId(80)).getAttribute('aria-current')).toBe('true');
    expect(restored.view.getContext()).toMatchObject({ mode: 'detail', id: noteId(80), limit: 100, listScrollTop: 4800, detailScrollTop: 1300 });
    expect(restored.list().scrollTop).toBe(4800);
    expect(restored.detail().scrollTop).toBe(1300);
    expect(restored.view.handleEscape()).toBe(true);
    expect(restored.view.getContext()).toMatchObject({ mode: 'list', query: 'Nowak', time: 'future', status: 'open', id: noteId(80), limit: 100 });
    expect(restored.list().scrollTop).toBe(4800);
    expect(restored.doc.activeElement).toBe(restored.row(noteId(80)));
    expect(restored.view.handleEscape()).toBe(false);
  });

  it('retains list mode and raises a too-small limit until its selected hit is rendered', async () => {
    const e = environment();
    await e.view.request(restoredSnapshot({ mode: 'list', limit: 50, detailScrollTop: 0, origin: null }));
    expect(e.host.querySelectorAll('.vgs-row')).toHaveLength(100);
    expect(e.row(noteId(80)).getAttribute('aria-current')).toBe('true');
    expect(e.view.getContext()).toMatchObject({ mode: 'list', id: noteId(80), limit: 100, listScrollTop: 4800 });
    expect(e.host.querySelector('.vgs').classList.contains('vgs-show-detail')).toBe(false);
    expect(e.view.handleEscape()).toBe(false);
  });

  it('expands an inline selected hit with the complete detail and return-to-list snapshot', async () => {
    const e = environment({ full: false });
    await selectedBeyondFirstPage(e);
    expect(e.options.requestExpand).toHaveBeenCalledTimes(1);
    const snapshot = e.options.requestExpand.mock.calls[0][0];
    expect(snapshot).toMatchObject({ version: 1, query: 'Nowak', time: 'future', status: 'open', id: noteId(80), mode: 'detail', limit: 100,
      listScrollTop: 4800, detailScrollTop: 0, origin: { listScrollTop: 4800, limit: 100 } });
    const full = environment();
    await full.view.request(snapshot);
    expect(full.host.querySelectorAll('.vgs-row')).toHaveLength(100);
    expect(full.view.getContext()).toMatchObject({ mode: 'detail', id: noteId(80), listScrollTop: 4800 });
    full.view.backToList();
    expect(full.list().scrollTop).toBe(4800);
    expect(full.doc.activeElement).toBe(full.row(noteId(80)));
  });

  it('preserves same-owner detail, scroll and keyboard focus across a data invalidation', async () => {
    const e = environment();
    await selectedBeyondFirstPage(e);
    const oldBack = e.host.querySelector('.vgs-back'); oldBack.focus();
    e.service.search.mockResolvedValue(records(120, ' Fikcyjna nowa treść.'));
    e.invalidate('sync');
    await e.flush();
    expect(e.view.getContext()).toMatchObject({ query: 'Nowak', time: 'future', status: 'open', id: noteId(80), mode: 'detail', limit: 100,
      listScrollTop: 4800, detailScrollTop: 1300, origin: { listScrollTop: 4800 } });
    expect(e.detail().textContent).toContain('Fikcyjna nowa treść.');
    expect(e.doc.activeElement).toBe(e.host.querySelector('.vgs-back'));
    expect(e.doc.activeElement.isConnected).toBe(true);
    e.view.backToList();
    expect(e.list().scrollTop).toBe(4800);
  });

  it('does not steal keyboard focus when the user leaves Search during a pending refresh', async () => {
    const e = environment(), pending = deferred();
    await selectedBeyondFirstPage(e);
    e.host.querySelector('.vgs-back').focus();
    e.service.search.mockImplementationOnce(() => pending.promise);
    const refresh = e.view.refresh();
    const outside = e.doc.body.appendChild(e.doc.createElement('button')); outside.textContent = 'Fikcyjna inna kontrolka'; outside.focus();
    pending.resolve(records(120, ' Fikcyjnie odświeżono.'));
    await refresh;
    expect(e.doc.activeElement).toBe(outside);
    expect(e.view.getContext()).toMatchObject({ mode: 'detail', id: noteId(80), detailScrollTop: 1300 });
  });

  it('does not reclaim focus after an outside interaction even when that outside control is removed', async () => {
    const e = environment(), pending = deferred();
    await selectedBeyondFirstPage(e);
    e.host.querySelector('.vgs-back').focus();
    e.service.search.mockImplementationOnce(() => pending.promise);
    const refresh = e.view.refresh();
    const outside = e.doc.body.appendChild(e.doc.createElement('button')); outside.focus();
    outside.remove();
    // Removing a focused external control returns native browser focus to body.
    e.doc.activeElement = e.doc.body;
    pending.resolve(records()); await refresh;
    expect(e.doc.activeElement).toBe(e.doc.body);
    expect(e.view.getContext()).toMatchObject({ mode: 'detail', id: noteId(80), detailScrollTop: 1300 });
  });

  it('Escape during a pending restore returns to the list and the late read cannot reopen its detail', async () => {
    const e = environment(), pending = deferred();
    e.service.search.mockImplementationOnce(() => pending.promise);
    const request = e.view.request(restoredSnapshot());
    expect(e.view.handleEscape()).toBe(true);
    expect(e.view.getContext()).toMatchObject({ mode: 'list', id: noteId(80), detailScrollTop: 0 });
    pending.resolve(records()); await request;
    expect(e.view.getContext()).toMatchObject({ mode: 'list', id: noteId(80), listScrollTop: 4800, detailScrollTop: 0 });
    expect(e.row(noteId(80)).getAttribute('aria-current')).toBe('true');
    expect(e.detail().contains(e.doc.activeElement)).toBe(false);
    expect(e.view.handleEscape()).toBe(false);
  });

  it('More results focuses the first newly revealed hit and a list restore never focuses a hidden detail action', async () => {
    const e = environment();
    await e.view.request({ query: 'Nowak' });
    const more = e.host.querySelector('.vgs-more'); more.focus(); more.click();
    expect(e.host.querySelectorAll('.vgs-row')).toHaveLength(100);
    expect(e.doc.activeElement).toBe(e.row(noteId(50)));
    expect(e.doc.activeElement.isConnected).toBe(true);
    await e.view.request(restoredSnapshot({ mode: 'list', focus: 'patient' }));
    expect(e.view.getContext()).toMatchObject({ mode: 'list', id: noteId(80) });
    expect(e.detail().contains(e.doc.activeElement)).toBe(false);
    expect(e.host.contains(e.doc.activeElement)).toBe(true);
  });

  it('retains a focused query control while restoring invalidated result content', async () => {
    const e = environment();
    await selectedBeyondFirstPage(e);
    const query = e.host.querySelector('.vgs-query'); query.focus();
    e.invalidate('data'); await e.flush();
    expect(e.doc.activeElement).toBe(query);
    expect(query.value).toBe('Nowak');
    expect(e.view.getContext()).toMatchObject({ mode: 'detail', listScrollTop: 4800, detailScrollTop: 1300 });
  });

  it('keeps query and filters with a neutral notice when the selected hit no longer exists', async () => {
    const e = environment({ rows: records().filter(row => row.id !== noteId(80)) });
    await e.view.request(restoredSnapshot());
    expect(e.view.getContext()).toMatchObject({ query: 'Nowak', time: 'future', status: 'open', id: null, mode: 'list' });
    expect(e.host.querySelectorAll('.vgs-row').length).toBeGreaterThan(0);
    expect(e.host.querySelectorAll('[aria-current="true"]')).toHaveLength(0);
    expect(e.host.textContent).toMatch(/(?:wybrany|wskazany).*(?:wynik|wpis)|(?:wynik|wpis).*(?:niedostępn|nie.*(?:pasuj|istnie)|zmien)/i);
    expect(e.detail().textContent).not.toContain('Fikcyjny długi opis 80.');
    expect(e.options.openPatient).not.toHaveBeenCalled();
  });

  it('lock clears pending restoration and a late result cannot revive the old owner context', async () => {
    const e = environment(), pending = deferred();
    e.service.search.mockImplementationOnce(() => pending.promise);
    const request = e.view.request(restoredSnapshot());
    e.status.unlocked = false; e.status.epoch += 1; e.invalidate('lock');
    expect(e.view.getContext()).toMatchObject({ query: '', time: 'all', status: 'all', id: null, mode: 'list', listScrollTop: 0, detailScrollTop: 0, origin: null });
    expect(e.host.querySelectorAll('.vgs-row')).toHaveLength(0);
    e.status.unlocked = true;
    pending.resolve(records()); await request;
    expect(e.view.getContext()).toMatchObject({ query: '', time: 'all', status: 'all', id: null, mode: 'list', origin: null });
    expect(e.host.querySelectorAll('.vgs-row')).toHaveLength(0);
    expect(e.host.textContent).not.toContain('Fikcyjny długi opis');
    expect(e.view.handleEscape()).toBe(false);
  });

  it('a newer restoration wins without late scroll, selected hit or focus from the old read', async () => {
    const e = environment(), old = deferred(), recent = deferred();
    e.service.search.mockImplementationOnce(() => old.promise).mockImplementationOnce(() => recent.promise);
    const first = e.view.request(restoredSnapshot());
    const second = e.view.request(restoredSnapshot({ query: 'Nowszy', id: noteId(0), limit: 50, listScrollTop: 0, detailScrollTop: 700,
      origin: { query: 'Nowszy', time: 'future', status: 'open', id: noteId(0), limit: 50, listScrollTop: 0 } }));
    recent.resolve(records(1, ' Fikcyjny nowszy odczyt.')); await second;
    const focus = e.doc.activeElement;
    old.resolve(records()); await first;
    expect(e.view.getContext()).toMatchObject({ query: 'Nowszy', id: noteId(0), limit: 50, listScrollTop: 0, detailScrollTop: 700, mode: 'detail' });
    expect(e.host.querySelectorAll('.vgs-row')).toHaveLength(1);
    expect(e.detail().textContent).toContain('Fikcyjny nowszy odczyt.');
    expect(e.doc.activeElement).toBe(focus);
  });

  it('legacy requests still open details and inline expansion without treating a selected id as list mode', async () => {
    const full = environment();
    await full.view.request({ query: 'Nowak', id: noteId(80) });
    expect(full.view.getContext()).toMatchObject({ mode: 'detail', id: noteId(80), limit: 100 });
    const inline = environment({ full: false });
    await inline.view.request({ query: 'Nowak', id: noteId(80) });
    expect(inline.options.requestExpand).toHaveBeenCalledTimes(1);
    expect(inline.options.requestExpand.mock.calls[0][0]).toMatchObject({ version: 1, query: 'Nowak', id: noteId(80), mode: 'detail', limit: 100 });
  });

  it('restores both real scroll containers after a hidden view loses its browser scroll offsets', async () => {
    const e = environment();
    await selectedBeyondFirstPage(e);
    e.view.setVisible(false);
    e.list().scrollTop = 0; e.detail().scrollTop = 0;
    await e.view.refresh();
    expect(e.service.search).toHaveBeenCalledTimes(1);
    expect(e.view.getContext()).toMatchObject({ mode: 'detail', listScrollTop: 4800, detailScrollTop: 1300 });
    e.view.setVisible(true); await settle();
    expect(e.list().scrollTop).toBe(4800);
    expect(e.detail().scrollTop).toBe(1300);
    expect(e.view.getContext()).toMatchObject({ mode: 'detail', id: noteId(80), limit: 100 });
  });

  it('refreshes an invalidated hidden view on reveal instead of waiting for an unscheduled read', async () => {
    const e = environment();
    await selectedBeyondFirstPage(e);
    e.view.setVisible(false);
    e.list().scrollTop = 0; e.detail().scrollTop = 0;
    e.service.search.mockResolvedValue(records(120, ' Fikcyjna zmiana podczas ukrycia.'));
    e.invalidate('data');
    expect(e.service.search).toHaveBeenCalledTimes(1);
    expect(e.host.querySelector('.vgs').getAttribute('aria-busy')).toBe('false');
    e.view.setVisible(true); await settle();
    expect(e.service.search).toHaveBeenCalledTimes(2);
    expect(e.detail().textContent).toContain('Fikcyjna zmiana podczas ukrycia.');
    expect(e.view.getContext()).toMatchObject({ mode: 'detail', id: noteId(80), listScrollTop: 4800, detailScrollTop: 1300 });
    e.view.setVisible(false); e.status.epoch += 1; e.invalidate('session'); e.view.setVisible(true); await settle();
    expect(e.service.search).toHaveBeenCalledTimes(2);
    expect(e.view.getContext()).toMatchObject({ query: '', id: null, mode: 'list', origin: null });
  });

  it('never restores inline list focus into the hidden list pane of a full mobile detail', async () => {
    const inline = environment({ full: false });
    await inline.view.request({ query: 'Nowak', id: noteId(80) });
    const value = inline.options.requestExpand.mock.calls[0][0];
    const full = environment();
    await full.view.request(value);
    expect(full.host.querySelector('.vgs').classList.contains('vgs-show-detail')).toBe(true);
    expect(full.doc.activeElement).toBe(full.host.querySelector('.vgs-back'));
    expect(full.host.querySelector('.vgs-list-pane').contains(full.doc.activeElement)).toBe(false);
  });

  it('does not expand a selected id from an unread hidden snapshot', async () => {
    const e = environment({ full: false });
    e.view.setVisible(false);
    expect(await e.view.request(restoredSnapshot())).toBe(false);
    expect(e.service.search).not.toHaveBeenCalled();
    expect(e.options.requestExpand).not.toHaveBeenCalled();
    e.view.setVisible(true); await settle();
    expect(e.service.search).toHaveBeenCalledTimes(1);
    expect(e.row(noteId(80))).toBeDefined();
    e.view.select(noteId(80));
    expect(e.options.requestExpand).toHaveBeenCalledTimes(1);
  });
});
