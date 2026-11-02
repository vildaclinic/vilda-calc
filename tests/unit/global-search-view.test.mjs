import fs from 'node:fs';
import vm from 'node:vm';
import { setImmediate as settle } from 'node:timers/promises';
import { describe, expect, it, vi } from 'vitest';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';

const source = fs.readFileSync(new URL('../../vilda_global_search_view.js', import.meta.url), 'utf8');
const deferred = () => { let resolve, reject; const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; }); return { promise, resolve, reject }; };
const record = (id = 'fictional-note', extra = {}) => ({
  id: 'note:' + id, noteId: id, kind: 'event', label: 'Wydarzenie', title: 'Fikcyjna biopsja', body: 'Fikcyjny opis.',
  patientId: 'fictional-patient', patientName: 'Fikcyjny Nowak', statusLabel: 'Do wykonania',
  eventDateISO: '2027-02-02', dueDateISO: '2027-02-02', source: { dueDateISO: '2027-02-02', category: 'followup' }, ...extra,
});

function environment({ full = true, mobile = false } = {}) {
  const doc = atrapaDokumentu(), create = doc.createElement;
  doc.createElement = tag => {
    const node = create(tag); node.dataset = new Proxy({}, { set(target, key, value) { target[key] = value; node.setAttribute('data-' + key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase()), value); return true; } }); node.scrollTop = 0;
    Object.defineProperty(node, 'childNodes', { get() { return this.children; } }); return node;
  };
  const host = doc.body.appendChild(doc.createElement('div'));
  const status = { unlocked: true, userId: 'fictional-account', current: true };
  const vault = { isUnlocked: () => status.unlocked, getCurrentUser: () => ({ userId: status.userId }),
    ACTIVITY_PATIENT_ID: '__vilda_activity__', EXTERNAL_PATIENT_ID: '__vilda_external__' };
  const service = { search: vi.fn(async () => [record()]), invalidate: vi.fn(), destroy: vi.fn() };
  let serviceOptions; const timers = new Map(); let serial = 0;
  const win = { document: doc, VildaGlobalSearch: { create: options => { serviceOptions = options; return service; } },
    matchMedia: () => ({ matches: mobile }), setTimeout: callback => { timers.set(++serial, callback); return serial; }, clearTimeout: id => timers.delete(id) };
  vm.runInNewContext(source, { window: win });
  const options = { full, vault, isCurrent: () => status.current, openPatient: vi.fn(), openCalendar: vi.fn(), openCare: vi.fn(), openReminder: vi.fn(), requestExpand: vi.fn() };
  const view = win.VildaGlobalSearchView.mount(host, options);
  return { doc, host, status, service, view, options, invalidate: reason => serviceOptions.onInvalidate(reason),
    flush: async () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()); await settle(); } };
}

describe('global search view production module', () => {
  it('explains a future clinical-date match without replacing source dates or repeating the matched day', async () => {
    const e = environment();
    const row = record('fictional-clinical', { kind: 'lab', label: 'Badanie', eventDateISO: '2026-05-20T10:00:00Z',
      clinicalDateISO: '2027-07-28T09:30:00Z', matchedDate: { kind: 'clinical', dateISO: '2027-07-28T09:30:00Z' } });
    const before = JSON.stringify(row); e.service.search.mockResolvedValue([row]);
    await e.view.request({ query: 'Fikcyjna', time: 'future', id: row.id });
    const rendered = e.host.querySelector('.vgs-row');
    expect(rendered.querySelector('.vb22-row-date').textContent).toBe('Badanie · 28.07.2027');
    expect(rendered.getAttribute('aria-label')).toContain('28.07.2027');
    expect(rendered.querySelector('.vb22-row-meta').textContent).not.toContain('20.05.2026');
    const dates = e.host.querySelector('.vgs-dates');
    expect(dates.querySelectorAll('dt').map(node => node.textContent)).toEqual(['Data wpisu / badania · pasuje do filtra', 'Termin wydarzenia']);
    expect(dates.querySelectorAll('dd').map(node => node.textContent)).toEqual(['28.07.2027', '20.05.2026']);
    expect(JSON.stringify(row)).toBe(before);
    expect(JSON.stringify(e.view.getContext())).not.toContain('matchedDate');
  });

  it('shows a matching plan step date even when its first event and reminder are older', async () => {
    const e = environment();
    const row = record('fictional-plan', { id: 'plan:fictional-plan', kind: 'plan', label: 'Plan opieki', planId: 'fictional-plan',
      eventDateISO: '2026-05-20', reminderDateISO: '2026-05-19', matchedDate: { kind: 'event', dateISO: '2027-08-02' } });
    e.service.search.mockResolvedValue([row]);
    await e.view.request({ query: 'Fikcyjny plan', time: 'future', id: row.id });
    expect(e.host.querySelector('.vb22-row-date').textContent).toBe('Wydarzenie · 02.08.2027');
    const dates = e.host.querySelector('.vgs-dates');
    expect(dates.querySelectorAll('dt').map(node => node.textContent)).toEqual(['Data wydarzenia · pasuje do filtra', 'Termin wydarzenia', 'Termin przypomnienia']);
    expect(dates.querySelectorAll('dd').map(node => node.textContent)).toEqual(['02.08.2027', '20.05.2026', '19.05.2026']);
  });

  it.each(['all', 'undated'])('does not leak query-specific date explanations into the %s filter', async time => {
    const e = environment();
    const row = record('fictional-other-projection', { matchedDate: { kind: 'clinical', dateISO: '2028-07-28' } });
    e.service.search.mockResolvedValue([row]);
    await e.view.request({ query: 'Fikcyjny', time, id: row.id });
    expect(e.host.querySelector('.vb22-row-date').textContent).toBe('02.02.2027');
    expect(e.host.querySelector('.vgs-dates').textContent).not.toContain('pasuje do filtra');
    expect(e.host.querySelector('.vgs-dates').textContent).not.toContain('28.07.2028');
  });

  it('names the time filter for all stored dates and retains the existing scalar values', () => {
    const e = environment(), filter = e.host.querySelector('.vgs-select');
    expect(filter.getAttribute('aria-label')).toBe('Daty wpisów');
    expect(filter.querySelectorAll('option').map(option => [option.value, option.textContent])).toEqual([
      ['all', 'Wszystkie daty'], ['future', 'Przyszłe daty'], ['past', 'Przeszłe daty'], ['today', 'Dzisiaj'], ['undated', 'Bez daty'],
    ]);
  });

  it('waits for a query, renders stored text literally and navigates only after the explicit patient action', async () => {
    const e = environment();
    expect(e.service.search).not.toHaveBeenCalled();
    expect(e.host.textContent).toContain('Wpisz nazwisko');
    e.service.search.mockResolvedValue([record('fictional-literal', { body: '<img src=x onerror="fictional()">', source: {} })]);
    await e.view.request({ query: 'Nowak' }); e.view.select('note:fictional-literal');
    expect(e.options.openPatient).not.toHaveBeenCalled(); expect(e.options.openCalendar).not.toHaveBeenCalled();
    expect(e.host.querySelector('.vb22-body').textContent).toBe('<img src=x onerror="fictional()">');
    expect(e.host.querySelector('img')).toBeNull();
    e.host.querySelectorAll('button').find(node => node.textContent === 'Otwórz w karcie pacjenta ↗').click();
    expect(e.options.openPatient).toHaveBeenCalledWith('fictional-patient', 'fictional-literal', expect.any(Object));
  });

  it('restores mobile search, filters, list position and focus when returning from a read-only preview', async () => {
    const e = environment({ mobile: true });
    await e.view.request({ query: 'biopsja', time: 'future', status: 'open' });
    const list = e.host.querySelector('.vgs-list'); list.scrollTop = 145;
    e.view.select('note:fictional-note');
    expect(e.host.querySelector('.vgs').classList.contains('vgs-show-detail')).toBe(true);
    expect(e.doc.activeElement).toBe(e.host.querySelector('.vgs-back'));
    e.host.querySelector('.vgs-back').click();
    expect(e.host.querySelector('.vgs').classList.contains('vgs-show-detail')).toBe(false);
    expect(e.view.getContext()).toEqual({ version: 1, query: 'biopsja', time: 'future', status: 'open', id: 'note:fictional-note',
      mode: 'list', limit: 50, listScrollTop: 145, detailScrollTop: 0,
      origin: { query: 'biopsja', time: 'future', status: 'open', id: 'note:fictional-note', limit: 50, listScrollTop: 145 },
      focus: 'row:note:fictional-note' });
    expect(list.scrollTop).toBe(145); expect(e.doc.activeElement.dataset.searchId).toBe('note:fictional-note');
    expect(e.options.openReminder).not.toHaveBeenCalled();
  });

  it('an older request cannot reselect or expand the result of a newer request', async () => {
    const e = environment({ full: false }), older = deferred(), newer = deferred();
    e.service.search.mockImplementationOnce(() => older.promise).mockImplementationOnce(() => newer.promise);
    const first = e.view.request({ query: 'starszy', id: 'note:older' });
    const second = e.view.request({ query: 'nowszy', id: 'note:newer' });
    newer.resolve([record('newer')]); await second;
    expect(e.options.requestExpand).toHaveBeenCalledTimes(1);
    older.resolve([record('older')]); await first;
    expect(e.options.requestExpand).toHaveBeenCalledTimes(1);
    expect(e.options.requestExpand).toHaveBeenCalledWith({ version: 1, query: 'nowszy', time: 'all', status: 'all', id: 'note:newer',
      mode: 'detail', limit: 50, listScrollTop: 0, detailScrollTop: 0,
      origin: { query: 'nowszy', time: 'all', status: 'all', id: 'note:newer', limit: 50, listScrollTop: 0 }, focus: 'list' });
    expect(e.host.querySelectorAll('.vgs-row').map(node => node.dataset.searchId)).toEqual(['note:newer']);
  });

  it('clears query, selected preview and pending reads immediately when the vault locks', async () => {
    const e = environment(), pending = deferred();
    await e.view.request({ query: 'Nowak', id: 'note:fictional-note' });
    expect(e.host.textContent).toContain('Fikcyjny Nowak');
    e.service.search.mockImplementationOnce(() => pending.promise);
    const read = e.view.refresh(); e.status.unlocked = false; e.invalidate('lock');
    expect(e.view.getContext()).toEqual({ version: 1, query: '', time: 'all', status: 'all', id: null,
      mode: 'list', limit: 50, listScrollTop: 0, detailScrollTop: 0, origin: null, focus: null });
    expect(e.host.textContent).not.toContain('Fikcyjny Nowak');
    pending.resolve([record('late')]); await read;
    expect(e.host.textContent).not.toContain('Fikcyjny Nowak');
    expect(e.host.querySelectorAll('.vgs-row')).toHaveLength(0);
  });

  it.each(['__vilda_activity__', '__vilda_external__'])('opens %s as a calendar matter without an invented patient card', async patientId => {
    const e = environment();
    e.service.search.mockResolvedValue([record('fictional-unassigned', { patientId, isActivity: patientId === '__vilda_activity__', canOpenPatient: false, source: {} })]);
    await e.view.request({ query: 'biopsja', id: 'note:fictional-unassigned' });
    expect(e.host.querySelector('.vb22-patient-link')).toBeNull();
    const actions = e.host.querySelector('.vgs-actions'); expect(actions.textContent).not.toContain('karcie pacjenta');
    actions.querySelector('button').click();
    expect(e.options.openCalendar).toHaveBeenCalledWith('fictional-unassigned', expect.any(Object));
    expect(e.options.openPatient).not.toHaveBeenCalled();
  });

  it('exposes read failure and retries the same query without restoring stale results', async () => {
    const e = environment(); e.service.search.mockRejectedValueOnce(Error('FICTIONAL_READ_FAILURE'));
    await e.view.request({ query: 'biopsja' });
    expect(e.host.querySelector('[role="alert"]').textContent).toContain('Nie udało się przeszukać');
    expect(e.host.querySelectorAll('.vgs-row')).toHaveLength(0);
    e.host.querySelector('[role="alert"]').querySelector('button').click(); await settle();
    expect(e.host.querySelector('[role="alert"]')).toBeNull();
    expect(e.host.querySelectorAll('.vgs-row')).toHaveLength(1);
    expect(e.service.search).toHaveBeenLastCalledWith('biopsja', { time: 'all', status: 'all' });
  });

  it('marks the debounced query busy immediately and does not duplicate a pending refresh when revealed twice', async () => {
    const e = environment(), pending = deferred(); e.service.search.mockImplementationOnce(() => pending.promise);
    const input = e.host.querySelector('.vgs-query'); input.value = 'biopsja'; input.dispatch('input');
    expect(e.host.querySelector('.vgs').getAttribute('aria-busy')).toBe('true');
    await e.flush(); e.invalidate('sync'); e.view.setVisible(true); e.view.setVisible(true);
    // Invalidation queues a fresh generation; repeated visibility does not add reads.
    expect(e.service.search).toHaveBeenCalledTimes(1);
    pending.resolve([record('stale')]); await settle();
    e.service.search.mockResolvedValue([record('current')]); await e.flush();
    expect(e.service.search).toHaveBeenCalledTimes(2);
    expect(e.host.querySelector('.vgs-row').dataset.searchId).toBe('note:current');
  });
});
