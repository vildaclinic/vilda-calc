import fs from 'node:fs';
import vm from 'node:vm';
import { setImmediate as settle } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';

const engineSource = fs.readFileSync(new URL('../../vilda_global_search.js', import.meta.url), 'utf8');
const viewSource = fs.readFileSync(new URL('../../vilda_global_search_view.js', import.meta.url), 'utf8');
const initialTimezone = process.env.TZ;
const mounted = [];
const patientId = 'fictional-local-day-patient';
const noteId = index => 'fictional-local-day-' + index;
const defaultNotes = () => [
  { id: noteId('old'), patientId, title: 'Fikcyjna sprawa z poprzedniego dnia', category: 'followup', dueDateISO: '2026-10-30' },
  { id: noteId('new'), patientId, title: 'Fikcyjna sprawa z nowego dnia', category: 'followup', dueDateISO: '2026-10-31' },
];

function eventTarget(target) {
  const listeners = new Map();
  target.addEventListener = (type, callback) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(callback);
  };
  target.removeEventListener = (type, callback) => listeners.get(type)?.delete(callback);
  target.dispatchEvent = event => {
    [...(listeners.get(event.type) || [])].forEach(callback => callback(event));
    return true;
  };
  return { count: type => listeners.get(type)?.size || 0 };
}

function environment(notes = defaultNotes(), { embedded = false } = {}) {
  const doc = atrapaDokumentu(), createElement = doc.createElement;
  const documentEvents = eventTarget(doc);
  doc.hidden = false;
  Object.defineProperty(doc, 'visibilityState', { get: () => doc.hidden ? 'hidden' : 'visible' });
  doc.createElement = tag => {
    const node = createElement(tag);
    node.dataset = new Proxy({}, { set(target, key, value) {
      target[key] = String(value);
      node.setAttribute('data-' + key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase()), value);
      return true;
    } });
    let scrollTop = 0;
    const maximum = () => node.classList.contains('vgs-list')
      ? Math.max(0, node.querySelectorAll('.vgs-row').length * 100 - 500)
      : node.classList.contains('vgs-detail') && node.querySelector('.vb22-body') ? 5000 : 0;
    Object.defineProperties(node, {
      childNodes: { get: () => node.children },
      scrollTop: { get: () => scrollTop, set: value => { scrollTop = Math.min(maximum(), Math.max(0, Number(value) || 0)); } },
      scrollHeight: { get: () => maximum() + 500 }, clientHeight: { get: () => 500 },
    });
    const removeChild = node.removeChild.bind(node);
    node.removeChild = child => {
      const lostFocus = child.contains(doc.activeElement), removed = removeChild(child);
      scrollTop = Math.min(scrollTop, maximum());
      if (lostFocus) doc.activeElement = doc.body;
      return removed;
    };
    node.focus = () => { doc.activeElement = node; doc.dispatchEvent({ type: 'focusin', target: node }); };
    return node;
  };
  doc.activeElement = doc.body;
  const host = doc.body.appendChild(doc.createElement('div'));
  const status = { unlocked: true, userId: 'fictional-local-day-account', epoch: 1 };
  const epoch = status.epoch, hooks = new Map(), timers = new Map();
  const vault = {
    isUnlocked: () => status.unlocked, getCurrentUser: () => status.unlocked ? { userId: status.userId } : null,
    ACTIVITY_PATIENT_ID: '__vilda_activity__', EXTERNAL_PATIENT_ID: '__vilda_external__',
    listPatients: vi.fn(async () => [{ patientId, header: { name: 'Fikcyjny Pacjent Lokalny' } }]),
    listExternalPatients: vi.fn(async () => []), listAllPatientNotes: vi.fn(async () => notes), listCarePlans: vi.fn(async () => []),
  };
  for (const name of ['onLock', 'onUnlock', 'onPatientSaved', 'onPatientDeleted', 'onPatientNoteChanged']) {
    vault[name] = callback => { if (!hooks.has(name)) hooks.set(name, new Set()); hooks.get(name).add(callback); };
  }
  const frameObservers = new Set(), frameElement = embedded ? { hidden: false } : null;
  const win = { document: doc, Date, URL, URLSearchParams, frameElement, matchMedia: () => ({ matches: true }),
    MutationObserver: class {
      constructor(callback) { this.callback = callback; }
      observe(target, options) { if (target !== frameElement || options.attributeFilter.join() !== 'hidden') throw Error('Unexpected frame observer'); frameObservers.add(this); }
      disconnect() { frameObservers.delete(this); }
    },
    setTimeout: (callback, delay = 0) => {
      const timer = setTimeout(() => { timers.delete(timer); callback(); }, delay);
      timers.set(timer, { delay, at: Date.now() + delay }); return timer;
    },
    clearTimeout: timer => { timers.delete(timer); clearTimeout(timer); },
  };
  const windowEvents = eventTarget(win);
  vm.runInNewContext(engineSource, { window: win, Date, URL, URLSearchParams });
  const createService = win.VildaGlobalSearch.create; let service;
  win.VildaGlobalSearch.create = options => {
    service = createService(options);
    vi.spyOn(service, 'search'); vi.spyOn(service, 'invalidate'); vi.spyOn(service, 'destroy');
    return service;
  };
  vm.runInNewContext(viewSource, { window: win, Date });
  const view = win.VildaGlobalSearchView.mount(host, { full: true, vault, isCurrent: () => status.epoch === epoch });
  const env = { doc, win, host, status, vault, view, service, timers, documentEvents, windowEvents,
    frameObserverCount: () => frameObservers.size,
    setFrameHidden: hidden => { frameElement.hidden = hidden; [...frameObservers].forEach(observer => observer.callback([{ attributeName: 'hidden' }])); },
    emit: name => { [...(hooks.get(name) || [])].forEach(callback => callback()); },
    rowIds: () => host.querySelectorAll('.vgs-row').map(row => row.dataset.searchId),
    list: () => host.querySelector('.vgs-list'), detail: () => host.querySelector('.vgs-detail'),
    wake: kind => {
      if (kind === 'visibilitychange') { doc.hidden = false; doc.dispatchEvent({ type: kind }); }
      else if (kind === 'setVisible') view.setVisible(true);
      else win.dispatchEvent({ type: kind });
    },
  };
  mounted.push(env); return env;
}

function assertSingleIndexRead(env) {
  for (const method of ['listPatients', 'listExternalPatients', 'listAllPatientNotes', 'listCarePlans']) expect(env.vault[method], method).toHaveBeenCalledTimes(1);
  expect(env.service.invalidate).not.toHaveBeenCalled();
}
const requestToday = env => env.view.request({ query: 'Fikcyjna', time: 'today', status: 'open' });
const nextDay = () => vi.setSystemTime(new Date('2026-10-31T00:00:01+01:00'));

beforeEach(() => {
  process.env.TZ = 'Europe/Warsaw';
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(new Date('2026-10-30T23:59:59+01:00'));
});
afterEach(() => {
  for (const env of mounted.splice(0)) env.view.destroy();
  vi.restoreAllMocks(); vi.useRealTimers();
  if (initialTimezone === undefined) delete process.env.TZ; else process.env.TZ = initialTimezone;
});

describe('Search refilters its cached index on the local calendar day boundary', () => {
  it.each(['iframe', 'document'])('defers a new index generation while its physical %s is hidden and reads it once on reveal', async surface => {
    const notes = defaultNotes(), env = environment(notes, { embedded: true });
    await env.view.request({ query: 'Fikcyjna', time: 'today', id: 'note:' + noteId('old') });
    const snapshot = env.view.getContext();
    if (surface === 'iframe') {
      env.setFrameHidden(true);
      expect(env.doc.hidden).toBe(false);
    } else { env.doc.hidden = true; env.doc.dispatchEvent({ type: 'visibilitychange' }); }
    expect(env.timers.size).toBe(0);
    notes.push({ id: noteId('added'), patientId, title: 'Fikcyjna nowa sprawa w tle', category: 'followup', dueDateISO: '2026-10-30' });
    env.emit('onPatientNoteChanged');
    await vi.advanceTimersByTimeAsync(150);
    for (const method of ['listPatients', 'listExternalPatients', 'listAllPatientNotes', 'listCarePlans']) expect(env.vault[method], method).toHaveBeenCalledTimes(1);
    expect(env.host.querySelector('.vgs').getAttribute('aria-busy')).toBe('false');
    expect(env.view.getContext()).toEqual(snapshot);
    if (surface === 'iframe') env.setFrameHidden(false); else env.wake('visibilitychange');
    await vi.advanceTimersByTimeAsync(150);
    expect(env.rowIds().sort()).toEqual(['note:' + noteId('old'), 'note:' + noteId('added')].sort());
    expect(env.view.getContext()).toMatchObject({ query: 'Fikcyjna', time: 'today', id: 'note:' + noteId('old'), mode: 'detail' });
    for (const method of ['listPatients', 'listExternalPatients', 'listAllPatientNotes', 'listCarePlans']) expect(env.vault[method], method).toHaveBeenCalledTimes(2);
    expect(env.service.destroy).not.toHaveBeenCalled();
  });

  it('restores the cached iframe row81 and both scrolls after physical hide/show without reading sources again', async () => {
    const notes = Array.from({ length: 120 }, (_, index) => ({ id: noteId(index), patientId, title: 'Fikcyjna sprawa ' + String(index).padStart(3, '0'),
      category: 'followup', dueDateISO: '2027-12-01', body: ('Fikcyjny długi opis ' + index + '. ').repeat(100) }));
    const env = environment(notes, { embedded: true });
    await env.view.request({ query: 'Fikcyjna', time: 'future', status: 'open', id: 'note:' + noteId(80), limit: 100 });
    env.list().scrollTop = 4800; env.detail().scrollTop = 1300;
    const snapshot = env.view.getContext();
    env.setFrameHidden(true); env.list().scrollTop = 0; env.detail().scrollTop = 0;
    env.setFrameHidden(false); await vi.advanceTimersByTimeAsync(150);
    expect(env.view.getContext()).toEqual(snapshot);
    expect(env.list().scrollTop).toBe(4800); expect(env.detail().scrollTop).toBe(1300);
    expect(env.host.querySelectorAll('.vgs-row')).toHaveLength(100);
    expect(env.service.search).toHaveBeenCalledTimes(1);
    assertSingleIndexRead(env);
  });

  it('cannot render or expand a visible read that finishes after its iframe was hidden', async () => {
    const env = environment(defaultNotes(), { embedded: true });
    let resolve;
    env.vault.listAllPatientNotes.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const request = requestToday(env);
    expect(resolve).toBeTypeOf('function');
    env.setFrameHidden(true); resolve(defaultNotes());
    expect(await request).toBe(false);
    expect(env.rowIds()).toEqual([]);
    expect(env.host.querySelector('.vgs').getAttribute('aria-busy')).toBe('false');
    env.setFrameHidden(false); await vi.advanceTimersByTimeAsync(150);
    expect(env.rowIds()).toEqual(['note:' + noteId('old')]);
    expect(env.service.search).toHaveBeenCalledTimes(2);
    assertSingleIndexRead(env);
  });

  it('disconnects its frame visibility observer on destroy', async () => {
    const env = environment(defaultNotes(), { embedded: true });
    await requestToday(env);
    expect(env.frameObserverCount()).toBe(1);
    env.view.destroy(); expect(env.frameObserverCount()).toBe(0);
    env.setFrameHidden(true); env.setFrameHidden(false); env.wake('focus');
    await vi.advanceTimersByTimeAsync(1500);
    expect(env.service.search).toHaveBeenCalledTimes(1);
    expect(env.timers.size).toBe(0);
    expect(env.host.children).toHaveLength(0);
  });

  it('changes Dzisiaj at local midnight while UTC still has the previous date, without invalidating or reading sources again', async () => {
    const env = environment();
    expect(new Date().getTimezoneOffset()).toBe(-60);
    await requestToday(env);
    expect(env.rowIds()).toEqual(['note:' + noteId('old')]);
    expect(env.service.search).toHaveBeenCalledExactlyOnceWith('Fikcyjna', { time: 'today', status: 'open' });
    await vi.advanceTimersByTimeAsync(1500);
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-10-30');
    expect(env.rowIds()).toEqual(['note:' + noteId('new')]);
    expect(env.service.search).toHaveBeenCalledTimes(2);
    expect(env.service.search).toHaveBeenLastCalledWith('Fikcyjna', { time: 'today', status: 'open' });
    assertSingleIndexRead(env);
  });

  it.each([
    { name: '23-hour spring day', start: '2027-03-28T00:00:00+01:00', end: '2027-03-29T00:00:00+02:00', offset: -60, hours: 23 },
    { name: '25-hour autumn day', start: '2027-10-31T00:00:00+02:00', end: '2027-11-01T00:00:00+01:00', offset: -120, hours: 25 },
  ])('schedules the next LOCAL date on a $name', async ({ start, end, offset, hours }) => {
    vi.setSystemTime(new Date(start));
    expect(new Date().getTimezoneOffset()).toBe(offset);
    const env = environment();
    await env.view.request({ query: 'Fikcyjna', time: 'future' });
    const next = [...env.timers.values()];
    expect(next).toHaveLength(1);
    const midnight = new Date(end).getTime();
    expect(midnight - Date.now()).toBe(hours * 60 * 60 * 1000);
    expect(next[0].at).toBeGreaterThanOrEqual(midnight);
    expect(next[0].at).toBeLessThanOrEqual(midnight + 250);
    expect(next[0].delay).not.toBe(24 * 60 * 60 * 1000);
    assertSingleIndexRead(env);
  });

  it.each(['visibilitychange', 'pageshow', 'focus', 'setVisible'])('checks the day after sleep via %s even when the midnight timer never fired', async kind => {
    const env = environment();
    await requestToday(env);
    if (kind === 'visibilitychange') { env.doc.hidden = true; env.doc.dispatchEvent({ type: 'visibilitychange' }); }
    if (kind === 'setVisible') env.view.setVisible(false);
    nextDay();
    env.wake(kind);
    await vi.advanceTimersByTimeAsync(150);
    expect(env.rowIds()).toEqual(['note:' + noteId('new')]);
    expect(env.service.search).toHaveBeenCalledTimes(2);
    assertSingleIndexRead(env);
  });

  it('coalesces repeated same-day wake events without refiltering or multiplying midnight timers', async () => {
    const env = environment();
    await requestToday(env);
    for (const kind of ['visibilitychange', 'pageshow', 'focus']) { env.wake(kind); env.wake(kind); }
    env.view.setVisible(false); env.view.setVisible(true); env.view.setVisible(true);
    await vi.advanceTimersByTimeAsync(150);
    expect(env.service.search).toHaveBeenCalledTimes(1);
    expect(env.timers.size).toBe(1);
    expect(env.rowIds()).toEqual(['note:' + noteId('old')]);
    assertSingleIndexRead(env);
  });

  it('keeps no day timer for an inactive query and suspends it while the document or view is hidden', async () => {
    const env = environment();
    expect(env.timers.size).toBe(0);
    await requestToday(env); expect(env.timers.size).toBe(1);
    env.doc.hidden = true; env.doc.dispatchEvent({ type: 'visibilitychange' });
    expect(env.timers.size).toBe(0);
    env.doc.hidden = false; env.wake('visibilitychange'); expect(env.timers.size).toBe(1);
    env.view.setVisible(false); expect(env.timers.size).toBe(0);
    env.view.setVisible(true); expect(env.timers.size).toBe(1);
    const input = env.host.querySelector('.vgs-query'), [time, status] = env.host.querySelectorAll('.vgs-select');
    input.value = ''; time.value = status.value = 'all'; input.dispatch('input');
    await vi.advanceTimersByTimeAsync(150);
    expect(env.timers.size).toBe(0);
    expect(env.service.search).toHaveBeenCalledTimes(1);
    assertSingleIndexRead(env);
  });

  it.each(['inside', 'outside'])('preserves selected row81, both scrolls, origin and %s focus during a day-only refilter', async focus => {
    const notes = Array.from({ length: 120 }, (_, index) => ({ id: noteId(index), patientId, title: 'Fikcyjna sprawa ' + String(index).padStart(3, '0'),
      category: 'followup', dueDateISO: '2027-12-01', body: ('Fikcyjny długi opis ' + index + '. ').repeat(100) }));
    const env = environment(notes);
    await env.view.request({ query: 'Fikcyjna', time: 'future', status: 'open' });
    env.host.querySelector('.vgs-more').click();
    env.list().scrollTop = 4800;
    env.view.select('note:' + noteId(80)); env.detail().scrollTop = 1300;
    let outside;
    if (focus === 'inside') env.host.querySelector('.vgs-back').focus();
    else { outside = env.doc.body.appendChild(env.doc.createElement('button')); outside.focus(); }
    const context = env.view.getContext();
    expect(context).toMatchObject({ mode: 'detail', id: 'note:' + noteId(80), limit: 100, listScrollTop: 4800, detailScrollTop: 1300 });
    await vi.advanceTimersByTimeAsync(1500);
    expect(env.service.search).toHaveBeenCalledTimes(2);
    expect(env.view.getContext()).toEqual(context);
    expect(env.list().scrollTop).toBe(4800); expect(env.detail().scrollTop).toBe(1300);
    expect(env.host.querySelectorAll('.vgs-row')).toHaveLength(100);
    expect(env.doc.activeElement).toBe(focus === 'inside' ? env.host.querySelector('.vgs-back') : outside);
    assertSingleIndexRead(env);
  });

  it.each(['query', 'outside'])('does not move %s focus when midnight removes the selected result from Dzisiaj', async focus => {
    const env = environment();
    await env.view.request({ query: 'Fikcyjna', time: 'today', id: 'note:' + noteId('old') });
    const control = focus === 'query' ? env.host.querySelector('.vgs-query') : env.doc.body.appendChild(env.doc.createElement('button'));
    control.focus();
    await vi.advanceTimersByTimeAsync(1500);
    expect(env.rowIds()).toEqual(['note:' + noteId('new')]);
    expect(env.view.getContext()).toMatchObject({ query: 'Fikcyjna', time: 'today', id: null, mode: 'list' });
    expect(env.host.textContent).toContain('Wskazany wpis jest niedostępny lub nie pasuje do aktualnych filtrów.');
    expect(env.doc.activeElement).toBe(control);
    assertSingleIndexRead(env);
  });

  it.each(['lock/unlock', 'owner epoch'])('cannot resurrect a pending day refresh after %s', async change => {
    const env = environment();
    await requestToday(env);
    const cached = await env.service.load();
    let resolve;
    env.service.search.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    vi.advanceTimersByTime(1500); await settle();
    expect(env.service.search).toHaveBeenCalledTimes(2);
    expect(resolve).toBeTypeOf('function');
    env.status.epoch += 1;
    if (change === 'lock/unlock') {
      env.status.unlocked = false; env.emit('onLock');
      expect(env.timers.size).toBe(0);
      env.status.unlocked = true; env.emit('onUnlock');
    } else env.wake('focus');
    resolve(cached); await settle();
    expect(env.view.getContext()).toMatchObject({ query: '', time: 'all', status: 'all', id: null, mode: 'list', origin: null });
    expect(env.rowIds()).toEqual([]);
    expect(env.host.textContent).not.toContain('Fikcyjna sprawa');
    expect(env.timers.size).toBe(0);
    env.wake('pageshow'); env.wake('focus');
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(env.service.search).toHaveBeenCalledTimes(2);
    expect(env.rowIds()).toEqual([]);
  });

  it('destroy cancels the midnight timer and removes wake listeners before any later event can read or render', async () => {
    const env = environment();
    await requestToday(env);
    expect(env.timers.size).toBe(1);
    expect(env.documentEvents.count('visibilitychange')).toBeGreaterThan(0);
    expect(env.windowEvents.count('pageshow')).toBeGreaterThan(0);
    expect(env.windowEvents.count('focus')).toBeGreaterThan(0);
    env.view.destroy();
    expect(env.timers.size).toBe(0);
    for (const kind of ['visibilitychange', 'focusin', 'pointerdown']) expect(env.documentEvents.count(kind), kind).toBe(0);
    for (const kind of ['pageshow', 'focus']) expect(env.windowEvents.count(kind), kind).toBe(0);
    nextDay();
    for (const kind of ['visibilitychange', 'pageshow', 'focus']) env.wake(kind);
    await vi.advanceTimersByTimeAsync(48 * 60 * 60 * 1000);
    expect(env.service.search).toHaveBeenCalledTimes(1);
    expect(env.host.children).toHaveLength(0);
    assertSingleIndexRead(env);
  });
});
