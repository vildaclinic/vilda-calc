import { describe, expect, it } from 'vitest';
import { calendarHarness, deferred, fictionalEvent } from '../support/terminarz-open-event-harness.mjs';

const tick = () => new Promise(resolve => { setImmediate(resolve); });
const selectedIds = harness => harness.selected().map(node => node.getAttribute('data-note-id'));

function expectReadonly(harness, snapshot) {
  expect(harness.snapshot()).toBe(snapshot);
  expect(harness.writes).toEqual([]);
  expect(harness.editors).toEqual([]);
  expect(harness.host.querySelectorAll('.tz-pop, .tz-new-term, .vilda-patient-note-editor-overlay')).toHaveLength(0);
}

describe('Terminarz public openEvent executes the actual reader and calendar renderer', () => {
  it('opens the freshly stored local date and exact note, preserving clinical data and appointment time', async () => {
    const oldSearchRow = fictionalEvent('fictional-moved', { dueDateISO: '2026-11-01T00:00:00.000Z' });
    const current = { ...oldSearchRow, dueDateISO: '2027-03-28T00:00:00.000Z', dueTime: '01:30', durationMin: 90 };
    const neighbor = fictionalEvent('fictional-similar', { title: current.title, dueTime: '03:30' });
    const harness = calendarHarness({ notes: [current, neighbor] });
    const snapshot = harness.snapshot();
    const result = await harness.api.openEvent({ noteId: oldSearchRow.id, expectedPatientId: oldSearchRow.patientId });
    expect(result).toEqual({ opened: true });
    expect(harness.reads).toContain(current.id);
    expect(harness.state).toMatchObject({ view: 'day', anchorISO: '2027-03-28', selectedISO: '2027-03-28', selectedEventId: current.id });
    expect(selectedIds(harness)).toEqual([current.id]);
    const target = harness.selected()[0];
    expect(target.classList.contains('tz-event-selected')).toBe(true);
    expect(target.getAttribute('tabindex')).toBe('-1');
    expect(target.getClientRects()).toHaveLength(1);
    expect(harness.document.scrolled.some(call => call.element === target)).toBe(true);
    expect(harness.document.activeElement).toBe(target);
    const summary = harness.host.querySelector(`[data-tz-selected-summary="${current.id}"]`);
    expect(summary?.querySelector('strong')?.textContent).toBe(current.title);
    expect(summary.textContent).not.toContain(current.body);
    expect(harness.ranges.some(range => range.start === '2027-03-27' && range.end.startsWith('2027-03-28'))).toBe(true);
    expectReadonly(harness, snapshot);
  });

  it.each([
    ['absent note', null, {}, 'missing'],
    ['undated note', fictionalEvent('fictional-target', { dueDateISO: null }), {}, 'undated'],
    ['plan helper', fictionalEvent('fictional-target', { careContext: { role: 'plan' } }), {}, 'not-calendar'],
    ['step helper', fictionalEvent('fictional-target', { careContext: { role: 'step' } }), {}, 'not-calendar'],
    ['decision helper', fictionalEvent('fictional-target', { careContext: { role: 'decision' } }), {}, 'not-calendar'],
    ['another patient', fictionalEvent('fictional-target'), { expectedPatientId: 'fictional-another-patient' }, 'patient-mismatch'],
  ])('rejects %s without an editor, fabricated event or write', async (_label, note, options, reason) => {
    const harness = calendarHarness({ notes: note ? [note] : [] });
    const snapshot = harness.snapshot();
    expect(await harness.api.openEvent({ noteId: 'fictional-target', ...options })).toEqual({ opened: false, reason });
    expect(selectedIds(harness)).toEqual([]);
    expectReadonly(harness, snapshot);
  });

  it('reports a failed fresh read without exposing the raw error or opening an editor', async () => {
    const harness = calendarHarness();
    harness.setReadHandler(() => { throw new Error('fictional storage diagnostic'); });
    expect(await harness.api.openEvent({ noteId: 'fictional-target' })).toEqual({ opened: false, reason: 'read-error' });
    expectReadonly(harness, '[]');
  });

  it('does not report success when the real calendar range no longer contains the target', async () => {
    const note = fictionalEvent();
    const harness = calendarHarness({ notes: [note] });
    harness.setRangeHandler(async () => []);
    expect(await harness.api.openEvent({ noteId: note.id })).toEqual({ opened: false, reason: 'not-calendar' });
    expect(selectedIds(harness)).toEqual([]);
  });

  it('reports a range read failure instead of selecting a fabricated fresh-read record', async () => {
    const note = fictionalEvent();
    const harness = calendarHarness({ notes: [note] });
    harness.setRangeHandler(async () => { throw new Error('fictional range diagnostic'); });
    expect(await harness.api.openEvent({ noteId: note.id })).toEqual({ opened: false, reason: 'read-error' });
    expect(selectedIds(harness)).toEqual([]);
  });

  it('does not claim an opened event when the calendar has no visible target node', async () => {
    const note = fictionalEvent();
    const harness = calendarHarness({ notes: [note] });
    harness.host.hidden = true;
    expect(await harness.api.openEvent({ noteId: note.id })).toEqual({ opened: false, reason: 'unavailable' });
    expect(selectedIds(harness)).toEqual([]);
  });

  it('reports a locked account before reading any patient note', async () => {
    const note = fictionalEvent();
    const harness = calendarHarness({ notes: [note] });
    harness.setLocked(true);
    expect(await harness.api.openEvent({ noteId: note.id })).toEqual({ opened: false, reason: 'locked' });
    expect(harness.reads).toEqual([]);
    expect(selectedIds(harness)).toEqual([]);
  });

  it.each([
    ['completed', { completedAtISO: '2027-03-28T09:30:00.000Z' }],
    ['no-show', { noShowAtISO: '2027-03-28T09:30:00.000Z' }],
  ])('can select a %s event without changing its recorded state', async (_label, patch) => {
    const note = fictionalEvent('fictional-finished', patch);
    const harness = calendarHarness({ notes: [note] });
    const snapshot = harness.snapshot();
    expect(await harness.api.openEvent({ noteId: note.id })).toEqual({ opened: true });
    expect(selectedIds(harness)).toEqual([note.id]);
    expectReadonly(harness, snapshot);
  });

  it('returns a completion Promise from refresh and preserves the selected actual node after refresh and rerender', async () => {
    const note = fictionalEvent();
    const harness = calendarHarness({ notes: [note] });
    await harness.api.openEvent({ noteId: note.id });
    const oldTarget = harness.selected()[0];
    const gate = deferred(), started = deferred();
    harness.setRangeHandler(() => { started.resolve(); return gate.promise; });
    let complete = false;
    const refresh = harness.api.refresh();
    expect(typeof refresh?.then).toBe('function');
    refresh.then(() => { complete = true; });
    await started.promise;
    expect(complete).toBe(false);
    gate.resolve([{ ...note, patientName: 'Fikcyjny Pacjent' }]);
    await refresh;
    expect(selectedIds(harness)).toEqual([note.id]);
    expect(harness.selected()[0]).not.toBe(oldTarget);
    harness.render();
    expect(selectedIds(harness)).toEqual([note.id]);
    expect(harness.selected()[0].getClientRects()).toHaveLength(1);
  });

  it.each(['read', 'range'])('preserves a newer header focus during a delayed %s while still selecting the saved event', async phase => {
    const note = fictionalEvent();
    const harness = calendarHarness({ notes: [note] });
    const gate = deferred(), started = deferred();
    if (phase === 'read') harness.setReadHandler(() => { started.resolve(); return gate.promise; });
    else harness.setRangeHandler(() => { started.resolve(); return gate.promise; });
    const pending = harness.api.openEvent({ noteId: note.id });
    await started.promise;
    const header = harness.document.createElement('button');
    harness.document.body.appendChild(header); header.focus();
    harness.document.dispatchEvent({ type: 'pointerdown', isTrusted: true, target: header });
    gate.resolve(phase === 'read' ? note : [{ ...note, patientName: 'Fikcyjny Pacjent' }]);
    expect(await pending).toEqual({ opened: true });
    expect(selectedIds(harness)).toEqual([note.id]);
    expect(harness.document.activeElement).toBe(header);
    expect(harness.document.scrolled).toEqual([]);
    expect(harness.writes).toEqual([]);
  });

  it('does not mistake programmatic scrolling or synthetic input for a newer user interaction', async () => {
    const note = fictionalEvent();
    const harness = calendarHarness({ notes: [note] });
    const gate = deferred(), started = deferred();
    harness.setRangeHandler(() => { started.resolve(); return gate.promise; });
    const pending = harness.api.openEvent({ noteId: note.id });
    await started.promise;
    harness.document.dispatchEvent({ type: 'scroll', isTrusted: true });
    harness.document.dispatchEvent({ type: 'pointerdown', isTrusted: false });
    gate.resolve([{ ...note, patientName: 'Fikcyjny Pacjent' }]);
    expect(await pending).toEqual({ opened: true });
    expect(harness.document.activeElement).toBe(harness.selected()[0]);
    expect(harness.document.scrolled.some(call => call.element === harness.selected()[0])).toBe(true);
  });

  it('keeps existing source and target journey metadata when opening replaces calendar history', async () => {
    const note = fictionalEvent();
    const harness = calendarHarness({ notes: [note] });
    const source = 'fictional-source-token';
    const target = { token: 'fictional-target-token', steps: 1 };
    harness.window.history.state = { vildaSearchCalendarSource: source, vildaSearchCalendarTarget: target, unrelated: 'fictional-other-owner' };
    expect(await harness.api.openEvent({ noteId: note.id })).toEqual({ opened: true });
    expect(harness.window.history.state).toMatchObject({ vildaSearchCalendarSource: source,
      vildaSearchCalendarTarget: target, unrelated: 'fictional-other-owner', tzNav: { view: 'day', anchor: '2027-03-28' } });
    expect(target.steps).toBe(1);
  });

  it('increments an existing journey on a view push and creates no journey marker for an ordinary calendar visit', async () => {
    for (const withJourney of [true, false]) {
      const note = fictionalEvent();
      const harness = calendarHarness({ notes: [note] });
      harness.window.history.state = withJourney ? { vildaSearchCalendarTarget: { token: 'fictional-return-token', steps: 1 } } : { unrelated: 'fictional-ordinary-visit' };
      await harness.api.openEvent({ noteId: note.id });
      harness.api.setView('week');
      await harness.api.refresh();
      expect(harness.window.history.state.tzNav.view).toBe('week');
      if (withJourney) expect(harness.window.history.state.vildaSearchCalendarTarget).toEqual({ token: 'fictional-return-token', steps: 2 });
      else {
        expect(Object.hasOwn(harness.window.history.state, 'vildaSearchCalendarTarget')).toBe(false);
        expect(harness.window.history.state.unrelated).toBe('fictional-ordinary-visit');
      }
    }
  });
});

describe('Terminarz cancels stale reads and ranges without leaking the previous selection', () => {
  for (const phase of ['read', 'range']) {
    it.each(['lock', 'owner', 'intent'])(`cancels when %s changes during the ${phase} await`, async change => {
      const note = fictionalEvent();
      const harness = calendarHarness({ notes: [note] });
      const gate = deferred(), started = deferred();
      let current = true;
      if (phase === 'read') harness.setReadHandler(() => { started.resolve(); return gate.promise; });
      else harness.setRangeHandler(() => { started.resolve(); return gate.promise; });
      const pending = harness.api.openEvent({ noteId: note.id, isCurrent: () => current });
      await started.promise;
      if (change === 'lock') harness.setLocked(true);
      if (change === 'owner') harness.setOwner('fictional-account-b');
      if (change === 'intent') current = false;
      gate.resolve(phase === 'read' ? note : [{ ...note, patientName: 'Fikcyjny Pacjent' }]);
      const result = await pending;
      expect(result.opened).toBe(false);
      expect(['locked', 'superseded']).toContain(result.reason);
      expect(selectedIds(harness)).toEqual([]);
      expect(harness.writes).toEqual([]);
      expect(harness.editors).toEqual([]);
    });
  }

  it('lets a newer B intent win while the older A note read is pending', async () => {
    const a = fictionalEvent('fictional-a');
    const b = fictionalEvent('fictional-b', { dueDateISO: '2027-07-14T00:00:00.000Z' });
    const harness = calendarHarness({ notes: [a, b] });
    const gate = deferred(), started = deferred();
    harness.setReadHandler(id => {
      if (id === a.id) { started.resolve(); return gate.promise; }
      return structuredClone(harness.notes.get(id));
    });
    const pendingA = harness.api.openEvent({ noteId: a.id });
    await started.promise;
    expect(await harness.api.openEvent({ noteId: b.id })).toEqual({ opened: true });
    gate.resolve(a);
    expect(await pendingA).toEqual({ opened: false, reason: 'superseded' });
    expect(selectedIds(harness)).toEqual([b.id]);
    expect(harness.state.anchorISO).toBe('2027-07-14');
  });

  it('does not render the old A range over a newer B target after the old load resolves', async () => {
    const a = fictionalEvent('fictional-a');
    const b = fictionalEvent('fictional-b', { dueDateISO: '2027-07-14T00:00:00.000Z' });
    const harness = calendarHarness({ notes: [a, b] });
    const gate = deferred(), started = deferred();
    harness.setRangeHandler((start, end) => {
      if (start === '2027-03-27') { started.resolve(); return gate.promise; }
      return [...harness.notes.values()].filter(note => note.dueDateISO.slice(0, 10) >= start.slice(0, 10)
        && note.dueDateISO.slice(0, 10) <= end.slice(0, 10));
    });
    const pendingA = harness.api.openEvent({ noteId: a.id });
    await started.promise;
    const pendingB = harness.api.openEvent({ noteId: b.id });
    await tick();
    gate.resolve([a]);
    expect(await pendingB).toEqual({ opened: true });
    expect(await pendingA).toEqual({ opened: false, reason: 'superseded' });
    expect(selectedIds(harness)).toEqual([b.id]);
    expect(harness.state.anchorISO).toBe('2027-07-14');
    expect(Object.keys(harness.state.notesByDay)).not.toContain('2027-03-28');
  });
});

describe('Terminarz selection has a visible representation beyond the normal day layout limits', () => {
  it.each([false, true])('renders the selected overlapping eighth event itself (mobile=%s)', async mobile => {
    const notes = Array.from({ length: 8 }, (_, index) => fictionalEvent('fictional-overlap-' + index));
    const target = notes.at(-1);
    const harness = calendarHarness({ notes, mobile });
    const snapshot = harness.snapshot();
    expect(await harness.api.openEvent({ noteId: target.id })).toEqual({ opened: true });
    expect(selectedIds(harness)).toEqual([target.id]);
    expect(harness.selected()[0].classList.contains('tz-hcard')).toBe(true);
    expect(harness.selected()[0].getClientRects()).toHaveLength(1);
    expect(harness.host.querySelectorAll('[data-more-ids]').some(node => (node.getAttribute('data-more-ids') || '').split(',').includes(target.id))).toBe(false);
    expectReadonly(harness, snapshot);
  });

  it('keeps a selected mobile all-day event visible when its sticky observer would collapse the list', async () => {
    const notes = Array.from({ length: 5 }, (_, index) => fictionalEvent('fictional-allday-' + index, { dueTime: null }));
    const harness = calendarHarness({ notes, mobile: true });
    expect(await harness.api.openEvent({ noteId: notes[4].id })).toEqual({ opened: true });
    expect(harness.observers.length).toBeGreaterThan(0);
    for (const observer of harness.observers) observer.callback([{ isIntersecting: false }]);
    expect(selectedIds(harness)).toEqual([notes[4].id]);
    expect(harness.selected()[0].getClientRects()).toHaveLength(1);
  });

  it('selects the requested second absence rather than the generic first absence banner', async () => {
    const first = fictionalEvent('fictional-absence-first', { category: 'absence', dueTime: null, title: 'Fikcyjna pierwsza nieobecność' });
    const target = fictionalEvent('fictional-absence-second', { category: 'absence', dueTime: null, title: 'Fikcyjna druga nieobecność' });
    const harness = calendarHarness({ notes: [first, target] });
    const snapshot = harness.snapshot();
    expect(await harness.api.openEvent({ noteId: target.id })).toEqual({ opened: true });
    expect(selectedIds(harness)).toEqual([target.id]);
    expect(harness.selected()[0].classList.contains('tz-selected-absence')).toBe(true);
    expect(harness.selected()[0].textContent).toContain(target.title);
    expect(harness.selected()[0].querySelectorAll('button')).toHaveLength(0);
    expectReadonly(harness, snapshot);
  });

  it('uses the original starting day for an appointment extending past midnight', async () => {
    const note = fictionalEvent('fictional-midnight', { dueTime: '23:30', durationMin: 120 });
    const harness = calendarHarness({ notes: [note] });
    expect(await harness.api.openEvent({ noteId: note.id })).toEqual({ opened: true });
    expect(harness.state.anchorISO).toBe('2027-03-28');
    expect(selectedIds(harness)).toEqual([note.id]);
    expect(harness.selected()[0].closest('.tz-tail-row,.tz-wb--tail')).toBe(null);
  });

  it('offers the supplied return callback without editor or patient-data writes', async () => {
    const note = fictionalEvent();
    const harness = calendarHarness({ notes: [note] });
    const calls = [];
    expect(await harness.api.openEvent({ noteId: note.id, returnToken: 'fictional-opaque-return',
      onReturn: async token => { calls.push(token); return true; } })).toEqual({ opened: true });
    const button = harness.host.querySelector('[data-tz-search-return]');
    expect(button?.textContent).toBe('← Wróć do Szukaj');
    button.click();
    await tick();
    expect(calls).toEqual(['fictional-opaque-return']);
    expect(harness.writes).toEqual([]);
    expect(harness.editors).toEqual([]);
  });
});
