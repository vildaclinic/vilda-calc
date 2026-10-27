import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function emitter(target) {
  const listeners = new Map();
  target.addEventListener = (type, fn) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
  };
  target.dispatchEvent = (event) => { for (const fn of listeners.get(event.type) || []) fn(event); };
  target.removeEventListener = (type, fn) => listeners.get(type)?.delete(fn);
  return target;
}

function setup({ columns = '400px 400px', rects = true, lifecycle = false, eligibility = 'eligible', deferredBounds = false,
  animated = false, reducedMotion = false, bootSince = null, deferStart = false, beforeStart, summaryPresentation } = {}) {
  const pending = [], subscribers = [], views = [], hosts = [], frames = new Map(), timers = new Map(), resizeObservers = [], boundsJobs = [], animations = [];
  let id = 0, currentToken = Object.freeze({ fictional: 'patient-a', revision: 1 });
  let refreshState = null;
  function element(rect = {}) {
    return {
      attributes: {}, setAttribute(name, value) { this.attributes[name] = value; },
      hidden: false, style: { setProperty(name, value) { this[name] = value; } }, children: [], parentNode: null,
      rect: { left: 0, right: 400, top: 0, bottom: 800, width: 400, height: 800, ...rect },
      getBoundingClientRect: vi.fn(function () { return this.rect; }),
      getClientRects() { return this.hidden ? [] : [{}]; },
      appendChild(child) { if (child.parentNode) child.remove(); this.children.push(child); child.parentNode = this; },
      remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; },
    };
  }
  const form = element(), fieldset = element(), doctor = element({ left: 420, right: 820 }), mount = element({ left: 420, right: 820, top: 30 }), puberty = element({ height: 320 }), strip = element();
  const notice = element(), noticeTitle = element(), noticeMessage = element(), retryButton = emitter(element());
  noticeTitle.hidden = true; noticeMessage.hidden = true; noticeMessage.textContent = '';
  notice.appendChild(noticeTitle); notice.appendChild(noticeMessage); notice.appendChild(retryButton); mount.appendChild(notice);
  mount.hidden = true;
  form.getClientRects = vi.fn(() => rects ? [{}] : []);
  const classes = new Set();
  const doc = emitter({ readyState: 'complete', documentElement: { classList: {
    toggle: (name, value) => value ? classes.add(name) : classes.delete(name),
    add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name),
  } },
  getElementById: (name) => ({ calcForm: form, doctorSection: doctor, vildaCentileLiveMount: mount, tannerStageWrap: puberty, vildaStatusSide: strip, vildaCentileLiveLoading: notice, vildaCentileLiveLoadingTitle: noticeTitle, vildaCentileLiveLoadingMessage: noticeMessage, vildaCentileLiveRetry: retryButton })[name] || null,
  querySelector: (selector) => selector === '#userSection fieldset.user-card' ? fieldset : null,
  });
  const style = { columns, pubertyDisplay: 'none', pubertyMarginTop: '12px', pubertyMarginBottom: '12px' };
  const data = {
    getSnapshot: vi.fn(() => new Promise((resolve, reject) => { pending.push({ resolve, reject }); })),
    isCurrent: vi.fn((candidate) => Boolean(candidate && (candidate.patientToken || candidate) === currentToken)),
    getRefreshState: vi.fn(() => refreshState),
    subscribe: (fn) => { subscribers.push(fn); return () => {}; },
  };
  if (lifecycle) {
    data.getEligibility = vi.fn(() => ({ status: eligibility }));
    data.getResult = vi.fn(() => new Promise((resolve, reject) => { pending.push({ resolve, reject }); }));
    data.retry = vi.fn();
  }
  const preview = vi.fn((snapshot) => ({ status: 'ready', source: snapshot.source,
    height: { preview: true, value: snapshot.currentHeight }, weight: { preview: true, value: snapshot.currentWeight } }));
  const render = vi.fn((snapshot) => ({ status: 'ready', source: snapshot.source,
    height: { preview: false, value: snapshot.currentHeight }, weight: { preview: false, value: snapshot.currentWeight } }));
  const prepareContentBounds = vi.fn((rendered, options) => {
    let resolve;
    const job = { rendered, options, promise: new Promise(done => { resolve = done; }),
      resolve: result => resolve(result), cancel: vi.fn(() => resolve({ status: 'cancelled' })), prioritize: vi.fn() };
    boundsJobs.push(job);
    return job;
  });
  const win = emitter({ document: doc, VildaCentileLiveData: data, __vildaRemindersResync: vi.fn(),
    __vildaCentileLivePendingSince: bootSince,
    matchMedia: () => ({ matches: reducedMotion }),
    getComputedStyle: (node) => node.computedStyle || (node === form ? { gridTemplateColumns: style.columns } : {
      display: node === puberty ? style.pubertyDisplay : 'block', marginTop: style.pubertyMarginTop, marginBottom: style.pubertyMarginBottom,
    }),
    requestAnimationFrame: (fn) => { const key = ++id; frames.set(key, fn); return key; },
    cancelAnimationFrame: (key) => frames.delete(key),
    setTimeout: vi.fn((fn, delay) => { const key = ++id; timers.set(key, { fn, delay, due: Date.now() + delay }); return key; }),
    clearTimeout: (key) => timers.delete(key),
    ResizeObserver: class { constructor(fn) { resizeObservers.push(fn); } observe() {} },
    VildaCentileLiveRender: { preview, render, probe: vi.fn(), ...(deferredBounds ? { prepareContentBounds } : {}) },
    VildaCentileLiveView: { create: vi.fn((options) => {
      const state = { metric: 'height', fullscreen: false };
      const view = {
        options, element: element(), expandButton: element(),
        fit: vi.fn(), update: vi.fn(), setStatus: vi.fn(),
        setFullscreen: vi.fn((value) => { state.fullscreen = value; }),
        setMetric: (value) => { state.metric = value; },
        destroy: vi.fn(() => view.element.remove()), getState: () => ({ ...state }),
      };
      if (animated) view.element.animate = vi.fn((keyframes, options) => {
        const animation = { keyframes, options, cancel: vi.fn(), onfinish: null, oncancel: null };
        animations.push(animation);
        return animation;
      });
      views.push(view); return view;
    }) },
  });
  const open = vi.fn((options) => {
    let resolveClosed;
    const handle = { options, closed: new Promise((resolve) => { resolveClosed = resolve; }),
      close: vi.fn((reason = 'user') => {
        options.onRestore({ current: options.isCurrent(options.patientToken), restored: true, reason });
        options.onClose({ reason, restored: true });
        resolveClosed({ reason, restored: true });
      }) };
    hosts.push(handle);
    options.onMount();
    return handle;
  });
  win.VildaCentileLiveHost = { open };
  if (summaryPresentation) win.VildaSummaryTabs = { getState: () => summaryPresentation };
  if (beforeStart) beforeStart({ fieldset, doctor, mount, puberty, style, element });
  loadBrowserScript('vilda_summary_layout.js', win);
  if (!deferStart) loadBrowserScript('vilda_centile_live_panel.js', win);
  const snapshot = (extra = {}) => ({ patientToken: currentToken, patientId: currentToken?.fictional || null,
    source: 'OLAF', ageMonths: 158, measurements: [], ...extra });
  return { win, doc, data, pending, views, hosts, open, preview, render, snapshot, style, classes, mount, fieldset, doctor, form, puberty,
    get api() { return win.VildaCentileLivePanel; },
    startController: () => loadBrowserScript('vilda_centile_live_panel.js', win),
    element, notice, noticeTitle, noticeMessage, retryButton, boundsJobs, prepareContentBounds, animations,
    setEligibility: value => { eligibility = value; },
    emit: (event) => subscribers.forEach((fn) => fn(event)),
    replacePatient: (name = 'patient-b') => { currentToken = Object.freeze({ fictional: name, revision: 2 }); },
    invalidate: () => { currentToken = null; eligibility = 'ineligible'; data.getEligibility = () => ({ status: eligibility }); },
    setRefreshState: (value) => { refreshState = value; },
    nextFrame: () => {
      // A callback may cancel a later callback in the same browser frame.
      for (const [key, fn] of [...frames]) {
        if (!frames.delete(key)) continue;
        fn();
      }
    },
    runTimers: (maxDelay = 1000) => { const callbacks = [...timers].filter(([, task]) => task.delay <= maxDelay); callbacks.forEach(([key, task]) => { timers.delete(key); task.fn(); }); },
    runDueTimers: () => {
      for (const [key, task] of [...timers].filter(([, task]) => task.due <= Date.now())) {
        if (timers.delete(key)) task.fn();
      }
    },
    resize: () => resizeObservers.forEach((fn) => fn()),
  };
}

const flush = async () => { for (let index = 0; index < 6; index++) await Promise.resolve(); };
async function ready(e) { e.pending[0].resolve(e.snapshot()); await flush(); return e.views[0]; }
async function expand(e, view = e.views.at(-1)) {
  view.options.onExpand();
  e.nextFrame();
  e.nextFrame();
  await flush();
  return view;
}

describe('live panel controller — async ownership and invalidation', () => {
  it('keeps the mounted weight chart and fullscreen while a same-visit save defers its next snapshot', async () => {
    const e = setup(); const view = await ready(e);
    view.setMetric('weight'); await expand(e, view);
    const height = e.mount.style['--vilda-centile-live-inline-height'];
    e.setRefreshState('pending');
    e.emit({ identityChanged: false, reason: 'patient-loaded' });
    expect(view.destroy).not.toHaveBeenCalled();
    e.nextFrame(); e.runTimers(); e.pending[1].resolve(null); await flush();
    expect(e.api.getState()).toMatchObject({ eligible: true, fullscreen: true, metric: 'weight' });
    expect(e.hosts[0].options.isCurrent(e.hosts[0].options.patientToken)).toBe(true);
    expect(e.hosts[0].close).not.toHaveBeenCalled();
    expect(e.mount.hidden).toBe(false);
    expect(e.mount.style['--vilda-centile-live-inline-height']).toBe(height);
    expect(e.win.__vildaRemindersResync).not.toHaveBeenCalled();
    e.setRefreshState(null);
    e.emit({ identityChanged: false, reason: 'vilda:dob-restored' });
    e.nextFrame(); e.runTimers(); e.pending[2].resolve(e.snapshot({ currentHeight: 159 })); await flush();
    expect(e.views).toHaveLength(1);
    expect(view.update).toHaveBeenCalledTimes(3);
    expect(e.render).toHaveBeenCalledTimes(2);
    expect(e.api.getState()).toMatchObject({ eligible: true, fullscreen: true, metric: 'weight' });
    expect(view.destroy).not.toHaveBeenCalled();
  });

  it('shows a concrete refresh failure in the same view and recovers without resetting its metric', async () => {
    const e = setup(); const view = await ready(e);
    view.setMetric('weight');
    e.setRefreshState('error');
    const failed = e.api.refresh(); e.pending[1].resolve(null); await failed;
    expect(e.api.getState()).toMatchObject({ status: 'unavailable', metric: 'weight', eligible: true });
    expect(view.setStatus).toHaveBeenCalledWith(expect.stringContaining('Nie udało się wczytać siatki'));
    expect(e.win.__vildaRemindersResync).not.toHaveBeenCalled();
    e.setRefreshState(null);
    const recovered = e.api.refresh(); e.pending[2].resolve(e.snapshot()); await recovered;
    expect(e.api.getState()).toMatchObject({ status: 'ready', metric: 'weight' });
    expect(e.views).toHaveLength(1);
    expect(view.update).toHaveBeenCalledTimes(2);
  });

  it.each(['owner', 'columns'])('a pending save never keeps a chart after %s invalidation', async kind => {
    const e = setup(); const view = await ready(e);
    await expand(e, view); e.setRefreshState('pending');
    const refresh = e.api.refresh();
    if (kind === 'owner') e.invalidate();
    else e.style.columns = '800px';
    e.pending[1].resolve(null); await refresh;
    expect(view.destroy).toHaveBeenCalledOnce();
    expect(e.hosts[0].close).toHaveBeenCalledWith('stale');
    expect(e.mount.hidden).toBe(true);
    expect(e.api.getState().eligible).toBe(false);
  });

  it('ignores an older snapshot that resolves after a newer refresh', async () => {
    const e = setup();
    const old = e.snapshot({ source: 'OLAF' });
    const refresh = e.api.refresh();
    const newer = e.snapshot({ source: 'PALCZEWSKA' });
    e.pending[1].resolve(newer); await refresh;
    e.pending[0].resolve(old); await flush();
    expect(e.preview).toHaveBeenCalledTimes(1);
    expect(e.preview).toHaveBeenCalledWith(newer);
    expect(e.api.getState()).toMatchObject({ patientId: 'patient-a', source: 'PALCZEWSKA', status: 'ready' });
    expect(e.views).toHaveLength(1);
  });

  it('cancels an old patient request at identity invalidation before the replacement request starts', async () => {
    const e = setup();
    const old = e.snapshot();
    e.replacePatient();
    e.emit({ identityChanged: true, reason: 'patient-loaded' });
    e.pending[0].resolve(old); await flush();
    expect(e.views).toHaveLength(0);
    expect(e.mount.hidden).toBe(false);
    expect(e.notice.hidden).toBe(false);
    e.nextFrame(); e.runTimers();
    const next = e.snapshot(); e.pending[1].resolve(next); await flush();
    expect(e.preview).toHaveBeenCalledWith(next);
    expect(e.api.getState().patientId).toBe('patient-b');
  });

  it('clears a fullscreen view synchronously and late snapshots cannot resurrect it', async () => {
    const e = setup(); const view = await ready(e);
    await expand(e, view);
    expect(view.setFullscreen).toHaveBeenCalledWith(true);
    const pendingRefresh = e.api.refresh();
    const obsolete = e.snapshot();
    e.invalidate(); e.emit({ identityChanged: true, reason: 'clear' });
    expect(view.element.hidden).toBe(true);
    expect(e.hosts[0].close).toHaveBeenCalledWith('patient-change');
    expect(view.destroy).toHaveBeenCalledOnce();
    expect(e.mount.hidden).toBe(true);
    expect(e.api.getState()).toMatchObject({ eligible: false, fullscreen: false, patientId: null });
    e.pending[1].resolve(obsolete); await pendingRefresh;
    expect(e.preview).toHaveBeenCalledTimes(1);
    expect(e.views).toHaveLength(1);
    expect(e.api.getState().eligible).toBe(false);
  });

  it('closes a fullscreen card with the lock reason and cannot reopen from stale callbacks', async () => {
    const e = setup(); const view = await ready(e);
    await expand(e, view);
    e.invalidate(); e.emit({ identityChanged: true, reason: 'lock' });
    expect(e.hosts[0].close).toHaveBeenCalledWith('lock');
    await expand(e, view);
    expect(e.open).toHaveBeenCalledTimes(1);
    expect(view.destroy).toHaveBeenCalledOnce();
  });

  it('passes the opaque patient token to host and refuses a superseded view owner', async () => {
    const e = setup(); const oldView = await ready(e);
    await expand(e, oldView);
    const options = e.hosts[0].options;
    expect(options.sourceWindow).toBe(e.win);
    expect(options.element).toBe(oldView.element);
    expect(options.isCurrent(options.patientToken)).toBe(true);
    e.replacePatient(); e.emit({ identityChanged: true, reason: 'patient-loaded' });
    expect(options.isCurrent(options.patientToken)).toBe(false);
    e.nextFrame(); e.runTimers(); e.pending[1].resolve(e.snapshot()); await flush();
    expect(e.views).toHaveLength(2);
    expect(options.isCurrent(options.patientToken)).toBe(false);
    expect(e.views[1].destroy).not.toHaveBeenCalled();
  });

  it('reuses an identical preview and redraws changed measurements and source without full canvases', async () => {
    const e = setup(); await ready(e);
    let refresh = e.api.refresh(); e.pending[1].resolve(e.snapshot()); await refresh;
    expect(e.preview).toHaveBeenCalledTimes(1);
    refresh = e.api.refresh(); e.pending[2].resolve(e.snapshot({ currentHeight: 159 })); await refresh;
    expect(e.preview).toHaveBeenCalledTimes(2);
    refresh = e.api.refresh(); e.pending[3].resolve(e.snapshot({ currentHeight: 159, source: 'PALCZEWSKA' })); await refresh;
    expect(e.preview).toHaveBeenCalledTimes(3);
    expect(e.render).not.toHaveBeenCalled();
    expect(e.prepareContentBounds).not.toHaveBeenCalled();
  });

  it('hides the card when eligibility disappears during the snapshot await', async () => {
    const e = setup();
    e.style.columns = '400px';
    e.pending[0].resolve(e.snapshot()); await flush();
    expect(e.views).toHaveLength(0);
    expect(e.preview).not.toHaveBeenCalled();
    expect(e.mount.hidden).toBe(true);
  });

  it('surfaces a renderer exception through the current view status and recovers on a later refresh', async () => {
    const e = setup();
    e.preview.mockImplementationOnce(() => { throw new Error('Synthetic renderer unavailable'); });
    e.pending[0].resolve(e.snapshot()); await flush();
    expect(e.api.getState().status).toBe('unavailable');
    expect(e.views[0].setStatus).toHaveBeenCalledWith(expect.stringContaining('Nie udało się'));
    const refresh = e.api.refresh(); e.pending[1].resolve(e.snapshot()); await refresh;
    expect(e.api.getState().status).toBe('ready');
    expect(e.views[0].update).toHaveBeenCalledOnce();
  });

  it('allows opening again after a host closes synchronously inside open', async () => {
    const e = setup(); const view = await ready(e);
    e.open.mockImplementationOnce((options) => {
      options.onMount();
      options.onRestore({ current: true, restored: true, reason: 'mount-error' });
      options.onClose({ current: true, restored: true, reason: 'mount-error' });
      return { closed: Promise.resolve({ reason: 'mount-error' }), close: vi.fn() };
    });
    await expand(e, view);
    await expand(e, view);
    expect(e.open).toHaveBeenCalledTimes(2);
  });
});

describe('live panel controller — actual form layout and collapsed height', () => {
  it.each(['one-column', 'hidden-form', 'stacked-sections', 'zero-width'])('does not fetch or mount in %s even with a desktop window', (scenario) => {
    const e = setup({ columns: scenario === 'one-column' ? '400px' : '400px 400px', rects: scenario !== 'hidden-form' });
    if (scenario === 'stacked-sections') { e.doctor.rect.left = 0; e.doctor.rect.top = 900; }
    if (scenario === 'zero-width') e.doctor.rect.width = 0;
    if (scenario === 'stacked-sections' || scenario === 'zero-width') {
      // The initial request is already pending; recheck geometry before consuming it.
      e.resize(); e.nextFrame();
    }
    if (scenario === 'one-column' || scenario === 'hidden-form') expect(e.data.getSnapshot).not.toHaveBeenCalled();
    expect(e.mount.hidden).toBe(true);
    expect(e.views).toHaveLength(0);
  });

  it('uses the collapsed fieldset height and status offset, never the grid row height', async () => {
    const e = setup(); const view = await ready(e);
    e.form.rect.height = 5000;
    expect(e.mount.style['--vilda-centile-live-inline-height']).toBe('770px');
    e.style.pubertyDisplay = 'block'; e.fieldset.rect.height = 1144;
    e.resize(); e.nextFrame();
    expect(e.mount.style['--vilda-centile-live-inline-height']).toBe('770px');
    e.puberty.rect.height = 800; e.fieldset.rect.height = 1624;
    e.resize(); e.nextFrame();
    expect(e.mount.style['--vilda-centile-live-inline-height']).toBe('770px');
    expect(e.data.getSnapshot).toHaveBeenCalledTimes(1);
  });

  it('retains the neighbours’ collapsed margin when measuring an already-open puberty panel at startup or after resize', async () => {
    function openPuberty(e) {
      e.style.pubertyDisplay = 'block';
      e.fieldset.rect.height = 1090.9375;
      e.puberty.rect.height = 329.859;
      const before = e.element({ bottom: 627.375 });
      const after = e.element({ top: 981.234 });
      before.computedStyle = { marginBottom: '0px' };
      after.computedStyle = { marginTop: '11.2px' };
      e.puberty.previousElementSibling = before;
      e.puberty.nextElementSibling = after;
    }
    for (const mode of ['startup-open', 'resize-open']) {
      const e = setup({ beforeStart: initial => {
        initial.mount.rect.top = 0;
        if (mode === 'startup-open') openPuberty(initial);
      } });
      await ready(e);
      if (mode === 'resize-open') {
        expect(e.mount.style['--vilda-centile-live-inline-height']).toBe('800px');
        e.fieldset.rect.width = 420; e.fieldset.rect.right = 420;
        e.doctor.rect.left = 440;
        e.style.columns = '420px 420px';
        openPuberty(e);
        e.resize(); e.nextFrame();
      }
      // 1090.9375 - (981.234 - 627.375 - 11.2) = 748.2785.
      expect(e.mount.style['--vilda-centile-live-inline-height'], mode).toBe('748px');
    }
  });

  it('removes an existing fullscreen view when the computed form becomes one column', async () => {
    const e = setup(); const view = await ready(e);
    await expand(e, view);
    e.style.columns = '800px'; e.resize(); e.nextFrame();
    expect(e.hosts[0].close).toHaveBeenCalledWith('stale');
    expect(view.destroy).toHaveBeenCalledOnce();
    expect(e.api.getState().eligible).toBe(false);
    expect(e.classes.has('vilda-centile-live-active')).toBe(false);
  });
});


describe('live panel controller — explicit slot lifecycle', () => {
  async function resolveReady(e, index = 0) {
    e.pending[index].resolve({ status: 'ready', snapshot: e.snapshot() });
    await flush();
    return e.views[e.views.length - 1];
  }

  it('reserves a measured neutral card before the first read without marking a chart active', async () => {
    const e = setup({ lifecycle: true });
    expect(e.mount.hidden).toBe(false);
    expect(e.notice.hidden).toBe(false);
    expect(e.mount.style['--vilda-centile-live-inline-height']).toBe('770px');
    expect(e.classes.has('vilda-centile-live-reserved')).toBe(true);
    expect(e.classes.has('vilda-centile-live-active')).toBe(false);
    expect(e.api.getState()).toMatchObject({ slotStatus: 'pending', eligible: false, patientId: null });
    await resolveReady(e);
    expect(e.notice.hidden).toBe(true);
    expect(e.api.getState()).toMatchObject({ slotStatus: 'ready', eligible: true });
    expect(e.win.__vildaRemindersResync).not.toHaveBeenCalled();
  });

  it('retries a transient result without exposing Reminders, even without another event', async () => {
    const e = setup({ lifecycle: true, eligibility: 'pending' });
    e.pending[0].resolve({ status: 'pending', reason: 'restore' }); await flush();
    expect(e.api.getState().slotStatus).toBe('pending');
    expect(e.mount.hidden).toBe(false);
    expect(e.win.__vildaRemindersResync).not.toHaveBeenCalled();
    e.setEligibility('eligible'); e.runTimers();
    expect(e.pending).toHaveLength(2);
    await resolveReady(e, 1);
    expect(e.api.getState().slotStatus).toBe('ready');
  });

  it('invalidates an older same-patient read synchronously, before the debounce', async () => {
    const e = setup({ lifecycle: true }); await resolveReady(e);
    const stale = e.api.refresh();
    e.emit({ identityChanged: false, reason: 'sync-status-changed' });
    e.pending[1].resolve({ status: 'ineligible' }); await stale;
    expect(e.mount.hidden).toBe(false);
    expect(e.views[0].destroy).not.toHaveBeenCalled();
    expect(e.win.__vildaRemindersResync).not.toHaveBeenCalled();
    e.nextFrame(); e.runTimers(); await resolveReady(e, 2);
    expect(e.api.getState().slotStatus).toBe('ready');
  });

  it('removes the old patient and fullscreen immediately but keeps the neutral slot', async () => {
    const e = setup({ lifecycle: true }); const old = await resolveReady(e);
    await expand(e, old);
    e.replacePatient(); e.emit({ identityChanged: true, reason: 'patient-loaded' });
    expect(old.destroy).toHaveBeenCalledOnce();
    expect(e.hosts[0].close).toHaveBeenCalledWith('patient-change');
    expect(e.mount.hidden).toBe(false);
    expect(e.notice.hidden).toBe(false);
    expect(e.api.getState()).toMatchObject({ patientId: null, eligible: false, slotStatus: 'pending' });
    e.nextFrame(); e.runTimers(); await resolveReady(e, 1);
    expect(e.api.getState().patientId).toBe('patient-b');
  });

  it('releases Reminders only after a confirmed ineligible result', async () => {
    const e = setup({ lifecycle: true });
    e.pending[0].resolve({ status: 'ineligible', reason: 'adult' }); await flush();
    expect(e.api.getState().slotStatus).toBe('ineligible');
    expect(e.mount.hidden).toBe(true);
    expect(e.classes.has('vilda-centile-live-reserved')).toBe(false);
    expect(e.win.__vildaRemindersResync).toHaveBeenCalledOnce();
  });

  it('shows a read error and retries inside the same slot, never falling back to Reminders', async () => {
    const e = setup({ lifecycle: true });
    e.pending[0].resolve({ status: 'error', reason: 'record-read' }); await flush();
    expect(e.api.getState().slotStatus).toBe('error');
    expect(e.retryButton.hidden).toBe(false);
    expect(e.noticeMessage.textContent).toContain('Nie udało się');
    expect(e.mount.hidden).toBe(false);
    e.retryButton.dispatchEvent({ type: 'click' });
    expect(e.data.retry).toHaveBeenCalledOnce();
    await resolveReady(e, 1);
    expect(e.retryButton.hidden).toBe(true);
    expect(e.win.__vildaRemindersResync).not.toHaveBeenCalled();
  });

  it('ends a stalled read with retry and ignores its late completion', async () => {
    const e = setup({ lifecycle: true });
    e.runTimers(10000);
    expect(e.api.getState().slotStatus).toBe('error');
    expect(e.retryButton.hidden).toBe(false);
    e.pending[0].resolve({ status: 'ready', snapshot: e.snapshot() }); await flush();
    expect(e.preview).not.toHaveBeenCalled();
    expect(e.api.getState().slotStatus).toBe('error');
    const retried = e.api.retry(); await resolveReady(e, 1); await retried;
    expect(e.api.getState().slotStatus).toBe('ready');
  });

  it('retains verified view state while a refresh is pending, including weight and fullscreen', async () => {
    const e = setup({ lifecycle: true }); const view = await resolveReady(e);
    view.setMetric('weight'); await expand(e, view);
    const refresh = e.api.refresh(); e.pending[1].resolve({ status: 'pending' }); await refresh;
    expect(e.api.getState()).toMatchObject({ metric: 'weight', fullscreen: true, slotStatus: 'pending' });
    expect(e.notice.hidden).toBe(true);
    expect(view.destroy).not.toHaveBeenCalled();
    e.runTimers(); await resolveReady(e, 2);
    expect(e.views).toHaveLength(1);
    expect(e.api.getState()).toMatchObject({ metric: 'weight', fullscreen: true, slotStatus: 'ready' });
  });

  it('reserves the slot synchronously when returning to two columns', async () => {
    const e = setup({ lifecycle: true }); await resolveReady(e);
    e.style.columns = '800px'; e.resize(); e.nextFrame();
    expect(e.mount.hidden).toBe(true);
    e.fieldset.rect.height = 900;
    e.style.columns = '400px 400px'; e.resize(); e.nextFrame();
    expect(e.mount.hidden).toBe(false);
    expect(e.notice.hidden).toBe(false);
    expect(e.api.getState().slotStatus).toBe('pending');
    expect(e.mount.style['--vilda-centile-live-inline-height']).toBe('870px');
    e.nextFrame(); e.runTimers(); await resolveReady(e, 1);
    expect(e.api.getState().slotStatus).toBe('ready');
  });

  it('waits for an intentional field edit without a read timeout or background polling', async () => {
    const e = setup({ lifecycle: true });
    e.pending[0].resolve({ status: 'pending', reason: 'measurement-edit' }); await flush();
    expect(e.noticeMessage.textContent).toContain('zakończeniu edycji');
    e.runTimers(10000);
    expect(e.pending).toHaveLength(1);
    expect(e.api.getState().slotStatus).toBe('pending');
    expect(e.retryButton.hidden).toBe(true);
    e.emit({ reason: 'measurement-commit', identityChanged: false });
    e.nextFrame(); e.runTimers(); await resolveReady(e, 1);
    expect(e.api.getState().slotStatus).toBe('ready');
  });


  it('offers retry in the neutral card if the view itself cannot be created', async () => {
    const e = setup({ lifecycle: true });
    e.win.VildaCentileLiveView.create.mockImplementationOnce(() => { throw new Error('Synthetic view failure'); });
    e.pending[0].resolve({ status: 'ready', snapshot: e.snapshot() }); await flush();
    expect(e.api.getState().slotStatus).toBe('error');
    expect(e.notice.hidden).toBe(false);
    expect(e.retryButton.hidden).toBe(false);
    expect(e.mount.hidden).toBe(false);
    expect(e.win.__vildaRemindersResync).not.toHaveBeenCalled();
    const refresh = e.api.retry(); await resolveReady(e, 1); await refresh;
    expect(e.api.getState().slotStatus).toBe('ready');
  });

});

describe('live panel controller — fullscreen graphics prepared only on demand', () => {
  async function prepared(e) {
    const view = await ready(e);
    await expand(e, view);
    e.boundsJobs[0].resolve({ status: 'ready' }); await flush();
    return view;
  }

  it('publishes both lightweight metrics immediately and never schedules full graphics while inline', async () => {
    const e = setup({ deferredBounds: true }); const view = await ready(e);
    expect(e.preview).toHaveBeenCalledWith(e.snapshot());
    expect(view.update).toHaveBeenCalledWith(expect.objectContaining({
      height: expect.objectContaining({ preview: true }), weight: expect.objectContaining({ preview: true }),
    }), e.snapshot());
    expect(e.api.getState()).toMatchObject({ status: 'ready', slotStatus: 'ready', preparingFullscreen: false });
    for (let index = 0; index < 5; index++) { e.nextFrame(); e.runTimers(); await flush(); }
    expect(e.render).not.toHaveBeenCalled();
    expect(e.prepareContentBounds).not.toHaveBeenCalled();
    expect(view.update).toHaveBeenCalledOnce();
  });

  it.each(['motion-enabled', 'reduced-motion', 'without-WAAPI'])('%s leaves the ready preview opaque without animation or idle readback', async mode => {
    const e = setup({ deferredBounds: true, animated: mode !== 'without-WAAPI', reducedMotion: mode === 'reduced-motion' });
    const view = await ready(e);
    expect(e.api.getState()).toMatchObject({ status: 'ready', slotStatus: 'ready' });
    expect(view.element.hidden).toBe(false);
    expect(e.animations).toHaveLength(0);
    for (let index = 0; index < 4; index++) e.nextFrame();
    expect(e.render).not.toHaveBeenCalled();
    expect(e.prepareContentBounds).not.toHaveBeenCalled();
    expect(view.update).toHaveBeenCalledOnce();
  });

  it.each(['lock', 'clear', 'patient-change', 'pagehide'])('%s before the expansion frame prevents stale full drawing', async reason => {
    const e = setup({ deferredBounds: true, animated: true }); const view = await ready(e);
    view.options.onExpand();
    expect(view.expandButton.attributes['aria-busy']).toBe('true');
    expect(e.render).not.toHaveBeenCalled();
    if (reason === 'pagehide') e.win.dispatchEvent({ type: 'pagehide' });
    else {
      if (reason === 'patient-change') e.replacePatient();
      else e.invalidate();
      e.emit({ reason, identityChanged: true });
    }
    expect(view.destroy).toHaveBeenCalledOnce();
    e.nextFrame(); await flush();
    expect(e.render).not.toHaveBeenCalled();
    expect(e.prepareContentBounds).not.toHaveBeenCalled();
    expect(e.open).not.toHaveBeenCalled();
  });

  it('a committed measurement and source update replace only the lightweight preview', async () => {
    const e = setup({ deferredBounds: true, animated: true }); const view = await ready(e);
    e.emit({ reason: 'measurement-commit', identityChanged: false });
    e.nextFrame(); e.runTimers();
    const next = e.snapshot({ source: 'PALCZEWSKA', currentHeight: 161 });
    e.pending[1].resolve(next); await flush();
    expect(e.preview).toHaveBeenCalledTimes(2);
    expect(view.update).toHaveBeenLastCalledWith(e.preview.mock.results[1].value, next);
    e.nextFrame(); e.nextFrame();
    expect(e.render).not.toHaveBeenCalled();
    expect(e.prepareContentBounds).not.toHaveBeenCalled();
    expect(e.animations).toHaveLength(0);
  });

  it('coalesces early expand clicks, allows the busy state to paint, and opens only with exact bounds', async () => {
    const e = setup({ deferredBounds: true }); const view = await ready(e);
    view.options.onExpand(); view.options.onExpand();
    expect(e.render).not.toHaveBeenCalled();
    expect(e.boundsJobs).toHaveLength(0);
    expect(view.expandButton.attributes['aria-busy']).toBe('true');
    expect(e.api.getState().preparingFullscreen).toBe(true);
    expect(e.open).not.toHaveBeenCalled();
    e.nextFrame(); await flush();
    expect(e.render).not.toHaveBeenCalled();
    e.nextFrame(); await flush();
    expect(e.render).toHaveBeenCalledOnce();
    expect(e.render).toHaveBeenCalledWith(e.snapshot(), { deferContentBounds: true });
    expect(e.boundsJobs).toHaveLength(1);
    expect(e.boundsJobs[0].prioritize).toHaveBeenCalledOnce();
    e.nextFrame(); e.nextFrame();
    expect(e.boundsJobs).toHaveLength(1);
    expect(view.update).toHaveBeenCalledOnce();
    e.boundsJobs[0].resolve({ status: 'ready' }); await flush();
    expect(e.open).toHaveBeenCalledOnce();
    expect(view.expandButton.attributes['aria-busy']).toBe('false');
    expect(view.update).toHaveBeenLastCalledWith(e.render.mock.results[0].value, e.snapshot());
    expect(e.api.getState()).toMatchObject({ fullscreen: true, preparingFullscreen: false });
  });

  it('Escape before full rendering cancels the queued work and allows a later explicit expansion', async () => {
    const e = setup({ deferredBounds: true }); const view = await ready(e);
    view.options.onExpand();
    const preventDefault = vi.fn();
    e.doc.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(view.expandButton.attributes['aria-busy']).toBe('false');
    e.nextFrame(); await flush();
    expect(e.render).not.toHaveBeenCalled();
    expect(e.prepareContentBounds).not.toHaveBeenCalled();
    expect(e.open).not.toHaveBeenCalled();
    await expand(e, view);
    e.boundsJobs[0].resolve({ status: 'ready' }); await flush();
    expect(e.open).toHaveBeenCalledOnce();
  });

  it('Escape during crop preparation prevents a late fullscreen opening', async () => {
    const e = setup({ deferredBounds: true }); const view = await ready(e);
    await expand(e, view);
    const job = e.boundsJobs[0], preventDefault = vi.fn();
    e.doc.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(view.expandButton.attributes['aria-busy']).toBe('false');
    job.resolve({ status: 'ready' }); await flush();
    expect(e.open).not.toHaveBeenCalled();
    expect(e.api.getState().preparingFullscreen).toBe(false);
    expect(view.update).toHaveBeenCalledOnce();
  });

  it.each(['lock', 'clear', 'columns'])('cancels preparation and late opening when %s invalidates the image', async reason => {
    const e = setup({ deferredBounds: true }); const view = await ready(e);
    await expand(e, view); const job = e.boundsJobs[0];
    if (reason === 'columns') { e.style.columns = '800px'; e.resize(); e.nextFrame(); }
    else { e.invalidate(); e.emit({ identityChanged: true, reason }); }
    expect(job.cancel).toHaveBeenCalledOnce();
    expect(job.options.isCurrent()).toBe(false);
    expect(view.expandButton.attributes['aria-busy']).toBe('false');
    expect(view.destroy).toHaveBeenCalledOnce();
    job.resolve({ status: 'ready' }); await flush();
    expect(e.open).not.toHaveBeenCalled();
    expect(e.api.getState().preparingFullscreen).toBe(false);
  });

  it('a changed snapshot cancels an outstanding expansion and keeps the new inline preview lightweight', async () => {
    const e = setup({ deferredBounds: true }); const view = await ready(e);
    await expand(e, view); const old = e.boundsJobs[0];
    const refresh = e.api.refresh();
    const next = e.snapshot({ currentHeight: 161 });
    e.pending[1].resolve(next); await refresh;
    expect(old.cancel).toHaveBeenCalledOnce();
    expect(old.options.isCurrent()).toBe(false);
    old.resolve({ status: 'ready' }); await flush();
    expect(e.open).not.toHaveBeenCalled();
    expect(view.update).toHaveBeenLastCalledWith(e.preview.mock.results.at(-1).value, next);
    e.nextFrame(); e.nextFrame();
    expect(e.render).toHaveBeenCalledOnce();
    expect(e.prepareContentBounds).toHaveBeenCalledOnce();
  });

  it.each(['between-frames', 'during-crop'])('resumes one explicit expansion after an unchanged background refresh %s', async phase => {
    const e = setup({ deferredBounds: true }); const view = await ready(e);
    view.options.onExpand(); e.nextFrame();
    if (phase === 'during-crop') { e.nextFrame(); await flush(); }
    const obsolete = e.boundsJobs[0], initialDraws = e.render.mock.calls.length;
    e.emit({ reason: 'after-update', identityChanged: false });
    e.emit({ reason: 'sync-status-changed', identityChanged: false });
    if (obsolete) {
      expect(obsolete.cancel).toHaveBeenCalledOnce();
      expect(obsolete.options.isCurrent()).toBe(false);
    }
    expect(view.expandButton.attributes['aria-busy']).toBe('true');
    expect(e.api.getState().preparingFullscreen).toBe(true);
    expect(e.open).not.toHaveBeenCalled();
    e.nextFrame(); e.runTimers();
    expect(e.pending).toHaveLength(2);
    e.pending[1].resolve(e.snapshot()); await flush();
    expect(e.render).toHaveBeenCalledTimes(initialDraws);
    e.nextFrame(); await flush();
    expect(e.render).toHaveBeenCalledTimes(initialDraws);
    e.nextFrame(); await flush();
    expect(e.render).toHaveBeenCalledTimes(initialDraws + 1);
    expect(e.boundsJobs).toHaveLength(initialDraws + 1);
    if (obsolete) { obsolete.resolve({ status: 'ready' }); await flush(); }
    expect(e.open).not.toHaveBeenCalled();
    e.boundsJobs.at(-1).resolve({ status: 'ready' }); await flush();
    e.nextFrame(); e.nextFrame(); e.runTimers(); await flush();
    expect(e.open).toHaveBeenCalledOnce();
    expect(e.preview).toHaveBeenCalledOnce();
    expect(view.expandButton.attributes['aria-busy']).toBe('false');
    expect(e.api.getState()).toMatchObject({ fullscreen: true, preparingFullscreen: false });
  });

  it.each(['between-frames', 'during-crop'])('does not resume the old expansion after a changed measurement refresh %s', async phase => {
    const e = setup({ deferredBounds: true }); const view = await ready(e);
    view.options.onExpand(); e.nextFrame();
    if (phase === 'during-crop') { e.nextFrame(); await flush(); }
    const obsolete = e.boundsJobs[0], initialDraws = e.render.mock.calls.length;
    e.emit({ reason: 'measurement-commit', identityChanged: false });
    e.nextFrame(); e.runTimers();
    const next = e.snapshot({ currentHeight: 161 });
    e.pending[1].resolve(next); await flush();
    e.nextFrame(); e.nextFrame(); await flush();
    if (obsolete) { obsolete.resolve({ status: 'ready' }); await flush(); }
    expect(e.render).toHaveBeenCalledTimes(initialDraws);
    expect(e.open).not.toHaveBeenCalled();
    expect(view.update).toHaveBeenLastCalledWith(e.preview.mock.results.at(-1).value, next);
    expect(view.expandButton.attributes['aria-busy']).toBe('false');
    expect(e.api.getState()).toMatchObject({ fullscreen: false, preparingFullscreen: false, status: 'ready' });
  });

  it('Escape cancels a suspended expansion before an unchanged refresh can resume it', async () => {
    const e = setup({ deferredBounds: true }); const view = await ready(e);
    await expand(e, view);
    const obsolete = e.boundsJobs[0];
    e.emit({ reason: 'after-update', identityChanged: false });
    e.nextFrame(); e.runTimers();
    expect(e.api.getState().preparingFullscreen).toBe(true);
    const preventDefault = vi.fn();
    e.doc.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(view.expandButton.attributes['aria-busy']).toBe('false');
    expect(e.api.getState().preparingFullscreen).toBe(false);
    e.pending[1].resolve(e.snapshot()); await flush();
    obsolete.resolve({ status: 'ready' }); await flush();
    e.nextFrame(); e.nextFrame(); await flush();
    expect(e.render).toHaveBeenCalledOnce();
    expect(e.prepareContentBounds).toHaveBeenCalledOnce();
    expect(e.open).not.toHaveBeenCalled();
    expect(view.update).toHaveBeenCalledOnce();
  });

  it('keeps a suspended explicit expansion through a transient pending read and resumes it only after confirmation', async () => {
    const e = setup({ deferredBounds: true, lifecycle: true });
    e.pending[0].resolve({ status: 'ready', snapshot: e.snapshot() }); await flush();
    const view = e.views[0];
    view.options.onExpand(); e.nextFrame();
    e.emit({ reason: 'after-update', identityChanged: false });
    e.nextFrame(); e.runTimers();
    e.pending[1].resolve({ status: 'pending', reason: 'restore' }); await flush();
    expect(e.api.getState()).toMatchObject({ slotStatus: 'pending', preparingFullscreen: true });
    expect(view.expandButton.attributes['aria-busy']).toBe('true');
    e.nextFrame(); e.nextFrame();
    expect(e.render).not.toHaveBeenCalled();
    e.runTimers(150);
    e.pending[2].resolve({ status: 'ready', snapshot: e.snapshot() }); await flush();
    e.nextFrame(); e.nextFrame(); await flush();
    expect(e.render).toHaveBeenCalledOnce();
    e.boundsJobs[0].resolve({ status: 'ready' }); await flush();
    expect(e.open).toHaveBeenCalledOnce();
    expect(e.api.getState()).toMatchObject({ fullscreen: true, preparingFullscreen: false });
  });

  it('a patient identity change clears a suspended expansion before the new patient becomes ready', async () => {
    const e = setup({ deferredBounds: true }); const old = await ready(e);
    old.options.onExpand(); e.nextFrame();
    e.emit({ reason: 'after-update', identityChanged: false });
    e.nextFrame(); e.runTimers();
    const obsolete = e.snapshot();
    e.replacePatient(); e.emit({ reason: 'patient-loaded', identityChanged: true });
    expect(old.destroy).toHaveBeenCalledOnce();
    expect(e.api.getState().preparingFullscreen).toBe(false);
    e.pending[1].resolve(obsolete); await flush();
    e.nextFrame(); e.runTimers();
    e.pending[2].resolve(e.snapshot()); await flush();
    e.nextFrame(); e.nextFrame(); await flush();
    expect(e.views).toHaveLength(2);
    expect(e.render).not.toHaveBeenCalled();
    expect(e.prepareContentBounds).not.toHaveBeenCalled();
    expect(e.open).not.toHaveBeenCalled();
    expect(e.api.getState()).toMatchObject({ patientId: 'patient-b', status: 'ready', preparingFullscreen: false });
  });

  it('an expand click after a measurement commit waits for the latest snapshot before full rendering', async () => {
    const e = setup({ deferredBounds: true }); const view = await ready(e);
    e.emit({ reason: 'measurement-commit', identityChanged: false });
    view.options.onExpand();
    expect(view.expandButton.attributes['aria-busy']).toBe('true');
    expect(e.render).not.toHaveBeenCalled();
    e.nextFrame(); e.runTimers(); await flush();
    expect(e.pending).toHaveLength(2);
    const next = e.snapshot({ currentHeight: 189 });
    e.pending[1].resolve(next); await flush();
    expect(view.update).toHaveBeenLastCalledWith(e.preview.mock.results.at(-1).value, next);
    expect(e.render).not.toHaveBeenCalled();
    e.nextFrame(); e.nextFrame(); await flush();
    expect(e.render).toHaveBeenCalledOnce();
    expect(e.render).toHaveBeenCalledWith(next, { deferContentBounds: true });
    e.boundsJobs[0].resolve({ status: 'ready' }); await flush();
    expect(e.open).toHaveBeenCalledOnce();
    expect(view.update).toHaveBeenLastCalledWith(e.render.mock.results[0].value, next);
  });

  it('the read watchdog clears a waiting expansion and a late committed snapshot cannot open fullscreen', async () => {
    const e = setup({ deferredBounds: true, lifecycle: true });
    e.pending[0].resolve({ status: 'ready', snapshot: e.snapshot() }); await flush();
    const view = e.views[0];
    e.emit({ reason: 'measurement-commit', identityChanged: false });
    view.options.onExpand();
    expect(e.pending).toHaveLength(2);
    expect(view.expandButton.attributes['aria-busy']).toBe('true');
    expect(e.api.getState().preparingFullscreen).toBe(true);
    e.runTimers(10000); await flush();
    expect(view.expandButton.attributes['aria-busy']).toBe('false');
    expect(e.api.getState()).toMatchObject({ status: 'unavailable', slotStatus: 'error', preparingFullscreen: false });
    expect(e.retryButton.hidden).toBe(false);
    expect(view.setStatus).toHaveBeenCalledWith(expect.stringContaining('trwa zbyt długo'));
    e.pending[1].resolve({ status: 'ready', snapshot: e.snapshot({ currentHeight: 189 }) }); await flush();
    e.nextFrame(); e.nextFrame(); await flush();
    expect(e.preview).toHaveBeenCalledOnce();
    expect(e.render).not.toHaveBeenCalled();
    expect(e.prepareContentBounds).not.toHaveBeenCalled();
    expect(e.open).not.toHaveBeenCalled();
    expect(e.api.getState()).toMatchObject({ slotStatus: 'error', preparingFullscreen: false });
  });

  it('Escape while an expansion waits for a committed field leaves only the updated preview', async () => {
    const e = setup({ deferredBounds: true }); const view = await ready(e);
    e.emit({ reason: 'measurement-commit', identityChanged: false });
    view.options.onExpand();
    e.nextFrame(); e.runTimers(); await flush();
    const preventDefault = vi.fn();
    e.doc.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(view.expandButton.attributes['aria-busy']).toBe('false');
    const next = e.snapshot({ currentHeight: 189 });
    e.pending[1].resolve(next); await flush();
    e.nextFrame(); e.nextFrame(); await flush();
    expect(view.update).toHaveBeenLastCalledWith(e.preview.mock.results.at(-1).value, next);
    expect(e.render).not.toHaveBeenCalled();
    expect(e.prepareContentBounds).not.toHaveBeenCalled();
    expect(e.open).not.toHaveBeenCalled();
    expect(e.api.getState()).toMatchObject({ status: 'ready', preparingFullscreen: false });
  });

  it('an identity change cancels an expansion waiting for the previous patient snapshot', async () => {
    const e = setup({ deferredBounds: true }); const old = await ready(e);
    const obsolete = e.snapshot({ currentHeight: 189 });
    e.emit({ reason: 'measurement-commit', identityChanged: false });
    old.options.onExpand();
    e.nextFrame(); e.runTimers(); await flush();
    e.replacePatient(); e.emit({ reason: 'patient-loaded', identityChanged: true });
    expect(old.destroy).toHaveBeenCalledOnce();
    e.pending[1].resolve(obsolete); await flush();
    e.nextFrame(); e.runTimers();
    const next = e.snapshot({ currentHeight: 120 });
    e.pending[2].resolve(next); await flush();
    e.nextFrame(); e.nextFrame(); await flush();
    expect(e.views).toHaveLength(2);
    expect(e.views[1].update).toHaveBeenLastCalledWith(e.preview.mock.results.at(-1).value, next);
    expect(e.render).not.toHaveBeenCalled();
    expect(e.prepareContentBounds).not.toHaveBeenCalled();
    expect(e.open).not.toHaveBeenCalled();
    expect(e.api.getState()).toMatchObject({ patientId: 'patient-b', status: 'ready', preparingFullscreen: false });
  });

  it('holds the existing fullscreen canvas until the replacement has its final crop', async () => {
    const e = setup({ deferredBounds: true }); const view = await prepared(e);
    const original = view.update.mock.calls.at(-1)[0];
    const refresh = e.api.refresh(); e.pending[1].resolve(e.snapshot({ currentHeight: 161 })); await flush();
    expect(e.boundsJobs).toHaveLength(2);
    expect(e.boundsJobs[1].rendered).not.toBe(original);
    expect(view.update).toHaveBeenCalledTimes(2);
    expect(view.update.mock.calls.at(-1)[0]).toBe(original);
    expect(e.api.getState().fullscreen).toBe(true);
    e.boundsJobs[1].resolve({ status: 'ready' }); await refresh;
    expect(view.update).toHaveBeenCalledTimes(3);
    expect(view.update.mock.calls.at(-1)[0]).toBe(e.boundsJobs[1].rendered);
    expect(e.hosts[0].close).not.toHaveBeenCalled();
  });

  it('restarts a superseded fullscreen replacement even when the next read has the same committed snapshot', async () => {
    const e = setup({ deferredBounds: true }); const view = await prepared(e);
    const original = view.update.mock.calls.at(-1)[0];
    const next = e.snapshot({ currentHeight: 161 });
    const changed = e.api.refresh(); e.pending[1].resolve(next); await flush();
    const obsolete = e.boundsJobs[1];
    e.emit({ reason: 'after-update', identityChanged: false });
    expect(obsolete.cancel).toHaveBeenCalledOnce();
    e.nextFrame(); e.runTimers();
    e.pending[2].resolve(next); await flush(); await changed;
    expect(view.update.mock.calls.at(-1)[0]).toBe(original);
    expect(e.boundsJobs).toHaveLength(3);
    e.boundsJobs[2].resolve({ status: 'ready' }); await flush();
    expect(view.update).toHaveBeenLastCalledWith(e.boundsJobs[2].rendered, next);
    expect(view.update.mock.calls.at(-1)[0].height.value).toBe(161);
    expect(e.api.getState()).toMatchObject({ fullscreen: true, status: 'ready', slotStatus: 'ready' });
  });

  it('reports a fullscreen refresh crop failure while retaining the image, then retries successfully', async () => {
    const e = setup({ deferredBounds: true, lifecycle: true });
    e.pending[0].resolve({ status: 'ready', snapshot: e.snapshot() }); await flush();
    const view = e.views[0]; await expand(e, view);
    e.boundsJobs[0].resolve({ status: 'ready' }); await flush();
    let refresh = e.api.refresh();
    e.pending[1].resolve({ status: 'ready', snapshot: e.snapshot({ currentHeight: 161 }) }); await flush();
    e.boundsJobs[1].resolve({ status: 'error' }); await refresh;
    expect(view.update).toHaveBeenCalledTimes(2);
    expect(view.setStatus).not.toHaveBeenCalled();
    expect(e.api.getState()).toMatchObject({ fullscreen: true, status: 'unavailable', slotStatus: 'error' });
    expect(e.retryButton.hidden).toBe(false);
    expect(e.retryButton.textContent).toContain('Nie udało się odświeżyć');
    refresh = e.api.retry();
    e.pending[2].resolve({ status: 'ready', snapshot: e.snapshot({ currentHeight: 161 }) }); await flush();
    e.boundsJobs[2].resolve({ status: 'ready' }); await refresh;
    expect(view.update).toHaveBeenCalledTimes(3);
    expect(e.retryButton.hidden).toBe(true);
    expect(e.retryButton.textContent).toBe('Spróbuj ponownie');
    expect(e.api.getState()).toMatchObject({ fullscreen: true, status: 'ready', slotStatus: 'ready' });
  });

  it('retains the displayed full image if rendering its replacement throws and retry uses the new snapshot', async () => {
    const e = setup({ deferredBounds: true, lifecycle: true });
    e.pending[0].resolve({ status: 'ready', snapshot: e.snapshot() }); await flush();
    const view = e.views[0]; await expand(e, view);
    e.boundsJobs[0].resolve({ status: 'ready' }); await flush();
    const original = view.update.mock.calls.at(-1)[0];
    const next = e.snapshot({ currentHeight: 161 });
    e.render.mockImplementationOnce(() => { throw new Error('Synthetic full refresh failure'); });
    let refresh = e.api.refresh();
    e.pending[1].resolve({ status: 'ready', snapshot: next }); await refresh;
    expect(view.update).toHaveBeenCalledTimes(2);
    expect(view.update.mock.calls.at(-1)[0]).toBe(original);
    expect(view.setStatus).not.toHaveBeenCalled();
    expect(e.api.getState()).toMatchObject({ fullscreen: true, status: 'unavailable', slotStatus: 'error' });
    expect(e.retryButton.hidden).toBe(false);
    expect(e.retryButton.textContent).toContain('Nie udało się odświeżyć');
    refresh = e.api.retry();
    e.pending[2].resolve({ status: 'ready', snapshot: next }); await flush();
    expect(e.render).toHaveBeenLastCalledWith(next, { deferContentBounds: true });
    e.boundsJobs[1].resolve({ status: 'ready' }); await refresh;
    expect(view.update).toHaveBeenLastCalledWith(e.boundsJobs[1].rendered, next);
    expect(e.retryButton.hidden).toBe(true);
    expect(e.api.getState()).toMatchObject({ fullscreen: true, status: 'ready', slotStatus: 'ready' });
  });

  it('restores the latest preview when closed during a fullscreen refresh and rejects the late canvas', async () => {
    const e = setup({ deferredBounds: true }); const view = await prepared(e);
    const next = e.snapshot({ currentHeight: 161 });
    const refresh = e.api.refresh(); e.pending[1].resolve(next); await flush();
    const obsolete = e.boundsJobs[1];
    e.hosts[0].close();
    expect(e.api.getState().fullscreen).toBe(false);
    expect(view.update).toHaveBeenLastCalledWith(e.preview.mock.results.at(-1).value, next);
    expect(view.update.mock.calls.at(-1)[0].height.preview).toBe(true);
    expect(obsolete.cancel).toHaveBeenCalledOnce();
    const updates = view.update.mock.calls.length;
    obsolete.resolve({ status: 'ready' }); await refresh;
    expect(view.update).toHaveBeenCalledTimes(updates);
    expect(e.open).toHaveBeenCalledOnce();
  });

  it('restores a lightweight preview after closing and prepares full graphics anew only on another expansion', async () => {
    const e = setup({ deferredBounds: true }); const view = await prepared(e);
    e.hosts[0].close();
    expect(view.update.mock.calls.at(-1)[0].height.preview).toBe(true);
    expect(e.api.getState()).toMatchObject({ fullscreen: false, status: 'ready' });
    e.nextFrame(); e.nextFrame();
    expect(e.render).toHaveBeenCalledOnce();
    await expand(e, view);
    expect(e.render).toHaveBeenCalledTimes(2);
    e.boundsJobs[1].resolve({ status: 'ready' }); await flush();
    expect(e.open).toHaveBeenCalledTimes(2);
    expect(e.api.getState().preparingFullscreen).toBe(false);
  });

  it('keeps the valid preview after a fullscreen crop failure and the retry button prepares only full graphics', async () => {
    const e = setup({ deferredBounds: true }); const view = await ready(e);
    await expand(e, view);
    e.boundsJobs[0].resolve({ status: 'error' }); await flush();
    expect(e.retryButton.hidden).toBe(false);
    expect(e.retryButton.textContent).toContain('Nie udało się przygotować');
    expect(view.update).toHaveBeenCalledOnce();
    expect(view.update.mock.calls[0][0].height.preview).toBe(true);
    expect(view.setStatus).not.toHaveBeenCalled();
    expect(view.expandButton.attributes['aria-busy']).toBe('false');
    expect(e.open).not.toHaveBeenCalled();
    e.retryButton.dispatchEvent({ type: 'click' });
    e.nextFrame(); e.nextFrame(); await flush();
    expect(e.preview).toHaveBeenCalledOnce();
    e.boundsJobs[1].resolve({ status: 'ready' }); await flush();
    expect(e.open).toHaveBeenCalledOnce();
    expect(e.retryButton.hidden).toBe(true);
    expect(e.api.getState()).toMatchObject({ status: 'ready', slotStatus: 'ready' });
  });

  it('keeps the current preview when full rendering throws and allows an explicit retry', async () => {
    const e = setup({ deferredBounds: true }); const view = await ready(e);
    e.render.mockImplementationOnce(() => { throw new Error('Synthetic full rendering failure'); });
    await expand(e, view);
    expect(e.open).not.toHaveBeenCalled();
    expect(view.update).toHaveBeenCalledOnce();
    expect(view.setStatus).not.toHaveBeenCalled();
    expect(view.expandButton.attributes['aria-busy']).toBe('false');
    expect(e.retryButton.hidden).toBe(false);
    await expand(e, view); e.boundsJobs[0].resolve({ status: 'ready' }); await flush();
    expect(e.open).toHaveBeenCalledOnce();
    expect(e.api.getState()).toMatchObject({ status: 'ready', slotStatus: 'ready' });
  });
});

describe('live panel controller — prompt readiness signals', () => {
  it('the completed main-session identity starts its replacement on the next frame without the ordinary debounce', async () => {
    const e = setup({ lifecycle: true, eligibility: 'pending' });
    e.pending[0].resolve({ status: 'pending', reason: 'restoring' }); await flush();
    e.setEligibility('eligible');
    e.emit({ reason: 'vilda:main-session-restored', identityChanged: true });
    e.emit({ reason: 'after-update', identityChanged: false });
    expect(e.pending).toHaveLength(1);
    e.nextFrame(); e.runTimers(0);
    expect(e.pending).toHaveLength(2);
    e.pending[1].resolve({ status: 'ready', snapshot: e.snapshot() }); await flush();
    expect(e.api.getState().slotStatus).toBe('ready');
    expect(e.win.__vildaRemindersResync).not.toHaveBeenCalled();
  });

  it.each(['startup-settled', 'vilda:dob-restored', 'vilda:auth-hidden', 'vilda:auth-state-settled',
    'vilda:auth-boot-settled', 'vilda:main-session-restored'])('refreshes %s at the next frame despite following ordinary updates', async reason => {
    const e = setup({ lifecycle: true, eligibility: 'pending' });
    e.pending[0].resolve({ status: 'pending' }); await flush();
    e.setEligibility('eligible');
    e.emit({ reason, identityChanged: false });
    e.emit({ reason: 'after-update', identityChanged: false });
    e.emit({ reason: 'change', identityChanged: false });
    expect(e.pending).toHaveLength(1);
    e.nextFrame();
    expect(e.pending).toHaveLength(2);
    e.runTimers(150);
    expect(e.pending).toHaveLength(2);
    e.pending[1].resolve({ status: 'ready', snapshot: e.snapshot() }); await flush();
    expect(e.api.getState().status).toBe('ready');
  });

  it('keeps ordinary updates debounced and readiness cannot bypass an identity change', async () => {
    const e = setup({ lifecycle: true });
    e.pending[0].resolve({ status: 'ready', snapshot: e.snapshot() }); await flush();
    e.emit({ reason: 'after-update', identityChanged: false });
    e.nextFrame(); e.runTimers(99);
    expect(e.pending).toHaveLength(1);
    e.runTimers(100); expect(e.pending).toHaveLength(2);
    e.emit({ reason: 'startup-settled', identityChanged: false });
    e.invalidate(); e.emit({ reason: 'lock', identityChanged: true });
    e.nextFrame(); e.runTimers(100);
    expect(e.pending).toHaveLength(2);
    expect(e.api.getState().eligible).toBe(false);
  });
});

describe('live panel controller — coalesced restoration geometry', () => {
  it.each(['pending', 'eligible'])('the first patient reserves a previously ineligible slot synchronously when %s', async eligibility => {
    const e = setup({ lifecycle: true, eligibility: 'ineligible' });
    expect(e.mount.hidden).toBe(true);
    expect(e.data.getResult).not.toHaveBeenCalled();
    e.fieldset.rect.height = 900;
    e.setEligibility(eligibility);
    e.emit({ reason: 'patient-loaded', identityChanged: true });
    // No animation frame or timer has run: the first applicable notification
    // must already hide Reminders and size the neutral slot for this paint.
    expect(e.mount.hidden).toBe(false);
    expect(e.notice.hidden).toBe(false);
    expect(e.classes.has('vilda-centile-live-reserved')).toBe(true);
    expect(e.classes.has('vilda-centile-live-active')).toBe(false);
    expect(e.mount.style['--vilda-centile-live-inline-height']).toBe('870px');
    expect(e.api.getState()).toMatchObject({ slotStatus: 'pending', eligible: false });
    expect(e.data.getResult).not.toHaveBeenCalled();
    e.form.getClientRects.mockClear();
    e.fieldset.getBoundingClientRect.mockClear();
    for (let index = 0; index < 40; index++) e.emit({ reason: 'change', identityChanged: false });
    expect(e.form.getClientRects).not.toHaveBeenCalled();
    expect(e.fieldset.getBoundingClientRect).not.toHaveBeenCalled();
    e.nextFrame(); e.runTimers(0);
    expect(e.data.getResult).toHaveBeenCalledOnce();
    e.pending[0].resolve({ status: 'ready', snapshot: e.snapshot() }); await flush();
    expect(e.api.getState().slotStatus).toBe('ready');
  });

  it('a first patient notification still does not reserve the slot in one column', () => {
    const e = setup({ lifecycle: true, eligibility: 'ineligible', columns: '800px' });
    e.setEligibility('eligible');
    e.emit({ reason: 'patient-loaded', identityChanged: true });
    expect(e.mount.hidden).toBe(true);
    expect(e.classes.has('vilda-centile-live-reserved')).toBe(false);
    e.nextFrame(); e.runTimers();
    expect(e.data.getResult).not.toHaveBeenCalled();
  });

  async function mounted() {
    const e = setup({ lifecycle: true });
    e.pending[0].resolve({ status: 'ready', snapshot: e.snapshot() }); await flush();
    e.nextFrame();
    e.form.getClientRects.mockClear();
    e.fieldset.getBoundingClientRect.mockClear();
    e.views[0].fit.mockClear();
    return e;
  }

  it('does not measure the form between restoration writes and starts one replacement read for the burst', async () => {
    const e = await mounted();
    const view = e.views[0];
    for (let index = 0; index < 40; index++) {
      e.fieldset.rect.height = 800 + index;
      e.emit({ reason: index % 2 ? 'change' : 'after-update', identityChanged: false });
    }
    expect(e.form.getClientRects).not.toHaveBeenCalled();
    expect(e.fieldset.getBoundingClientRect).not.toHaveBeenCalled();
    expect(view.fit).not.toHaveBeenCalled();
    expect(e.data.getResult).toHaveBeenCalledOnce();
    expect(view.destroy).not.toHaveBeenCalled();
    e.nextFrame();
    expect(e.form.getClientRects).toHaveBeenCalledOnce();
    expect(e.fieldset.getBoundingClientRect).toHaveBeenCalledOnce();
    expect(e.data.getResult).toHaveBeenCalledOnce();
    e.runTimers();
    expect(e.data.getResult).toHaveBeenCalledTimes(2);
    const current = e.snapshot({ currentHeight: 159 });
    e.pending[1].resolve({ status: 'ready', snapshot: current }); await flush();
    expect(view.update).toHaveBeenLastCalledWith(expect.anything(), current);
    expect(e.mount.style['--vilda-centile-live-inline-height']).toBe('809px');
    expect(e.win.__vildaRemindersResync).not.toHaveBeenCalled();
  });

  it('erases another patient synchronously without a geometry read or a released slot', async () => {
    const e = await mounted();
    const old = e.views[0], height = e.mount.style['--vilda-centile-live-inline-height'];
    e.emit({ reason: 'after-update', identityChanged: false });
    e.replacePatient(); e.emit({ reason: 'patient-loaded', identityChanged: true });
    e.emit({ reason: 'change', identityChanged: false });
    expect(old.element.hidden).toBe(true);
    expect(old.destroy).toHaveBeenCalledOnce();
    expect(e.form.getClientRects).not.toHaveBeenCalled();
    expect(e.fieldset.getBoundingClientRect).not.toHaveBeenCalled();
    expect(e.mount.hidden).toBe(false);
    expect(e.notice.hidden).toBe(false);
    expect(e.mount.style['--vilda-centile-live-inline-height']).toBe(height);
    expect(e.api.getState()).toMatchObject({ patientId: null, slotStatus: 'pending' });
    expect(e.win.__vildaRemindersResync).not.toHaveBeenCalled();
    e.nextFrame(); e.runTimers(0);
    expect(e.data.getResult).toHaveBeenCalledTimes(2);
    e.pending[1].resolve({ status: 'ready', snapshot: e.snapshot() }); await flush();
    expect(e.api.getState().patientId).toBe('patient-b');
  });

  it.each(['hidden', 'one-column'])('checks the current %s layout before a queued refresh can fetch', async mode => {
    const e = await mounted();
    e.emit({ reason: 'startup-settled', identityChanged: false });
    if (mode === 'hidden') e.form.getClientRects.mockReturnValue([]);
    else e.style.columns = '800px';
    e.nextFrame(); e.runTimers();
    expect(e.data.getResult).toHaveBeenCalledOnce();
    expect(e.mount.hidden).toBe(true);
    expect(e.views[0].destroy).toHaveBeenCalledOnce();
  });

  it('pagehide cancels geometry and refresh queues, while pageshow can reserve the card again', async () => {
    const e = await mounted();
    e.emit({ reason: 'startup-settled', identityChanged: false });
    e.resize();
    e.win.dispatchEvent({ type: 'pagehide' });
    expect(e.mount.hidden).toBe(true);
    e.nextFrame(); e.runTimers();
    expect(e.form.getClientRects).not.toHaveBeenCalled();
    expect(e.data.getResult).toHaveBeenCalledOnce();
    expect(e.mount.hidden).toBe(true);
    e.win.dispatchEvent({ type: 'pageshow' });
    e.fieldset.rect.height = 900;
    e.nextFrame();
    expect(e.mount.hidden).toBe(false);
    expect(e.api.getState().slotStatus).toBe('pending');
    expect(e.mount.style['--vilda-centile-live-inline-height']).toBe('870px');
    e.runTimers();
    expect(e.data.getResult).toHaveBeenCalledTimes(2);
  });

  it('an explicit retry replaces queued event work instead of starting a duplicate read', async () => {
    const e = await mounted();
    e.emit({ reason: 'after-update', identityChanged: false });
    const retry = e.api.retry();
    e.nextFrame(); e.runTimers();
    expect(e.data.retry).toHaveBeenCalledOnce();
    expect(e.data.getResult).toHaveBeenCalledTimes(2);
    e.pending[1].resolve({ status: 'ready', snapshot: e.snapshot() }); await retry;
    expect(e.api.getState().slotStatus).toBe('ready');
  });

  it.each(['startup-settled', 'vilda:auth-boot-settled', 'vilda:main-session-restored'])('%s cannot bypass restoration that becomes pending before the frame', async reason => {
    const e = await mounted();
    e.emit({ reason, identityChanged: false });
    e.setEligibility('pending');
    e.nextFrame();
    expect(e.data.getResult).toHaveBeenCalledOnce();
    expect(e.api.getState().slotStatus).toBe('pending');
    expect(e.views[0].destroy).not.toHaveBeenCalled();
    e.runTimers(100);
    expect(e.data.getResult).toHaveBeenCalledTimes(2);
    e.pending[1].resolve({ status: 'pending', reason: 'restore' }); await flush();
    expect(e.preview).toHaveBeenCalledOnce();
    expect(e.api.getState().slotStatus).toBe('pending');
    expect(e.win.__vildaRemindersResync).not.toHaveBeenCalled();
  });
});

describe('live panel controller — quiet waiting and immediate preview', () => {
  let clock;
  let now;
  function at(value = 10000) {
    now = value;
    if (!clock) clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
  }
  afterEach(() => { clock?.mockRestore(); clock = null; });

  it('a quick response never inserts a loading announcement and stale timer callbacks cannot show it after ready', async () => {
    at();
    const e = setup({ lifecycle: true, animated: true });
    expect(e.mount.hidden).toBe(false);
    expect(e.notice.hidden).toBe(false);
    expect(e.noticeTitle.hidden).toBe(true);
    expect(e.noticeMessage.hidden).toBe(true);
    expect(e.noticeMessage.textContent).toBe('');
    const delayed = e.win.setTimeout.mock.calls.find(([, delay]) => delay === 1200)[0];
    e.pending[0].resolve({ status: 'ready', snapshot: e.snapshot() }); await flush();
    at(11500); e.runDueTimers(); delayed();
    expect(e.api.getState().status).toBe('ready');
    expect(e.notice.hidden).toBe(true);
    expect(e.noticeMessage.textContent).toBe('');
    expect(e.noticeMessage.hidden).toBe(true);
    expect(e.animations).toHaveLength(0);
  });

  it('150 ms read retries do not restart the continuous 1200 ms waiting interval', async () => {
    at();
    const e = setup({ lifecycle: true, eligibility: 'pending' });
    e.pending[0].resolve({ status: 'pending' }); await flush();
    for (let index = 1; index <= 7; index++) {
      at(10000 + 150 * index); e.runDueTimers();
      e.pending[index].resolve({ status: 'pending' }); await flush();
      expect(e.noticeMessage.hidden).toBe(true);
      expect(e.noticeMessage.textContent).toBe('');
    }
    expect(e.win.setTimeout.mock.calls.filter(([, delay]) => delay === 1200)).toHaveLength(1);
    at(11199); e.runDueTimers();
    expect(e.noticeMessage.hidden).toBe(true);
    at(11200); e.runDueTimers();
    expect(e.noticeMessage.hidden).toBe(false);
    expect(e.noticeTitle.hidden).toBe(false);
    expect(e.noticeMessage.textContent).toBe('Wczytywanie siatki…');
    expect(e.api.getState().slotStatus).toBe('pending');
    at(20000); e.runDueTimers();
    expect(e.api.getState().slotStatus).toBe('error');
    expect(e.noticeMessage.textContent).toContain('trwa zbyt długo');
    expect(e.retryButton.hidden).toBe(false);
  });

  it('an intentional edit and a read error are announced immediately, while retry starts a fresh quiet wait', async () => {
    at();
    const e = setup({ lifecycle: true });
    e.pending[0].resolve({ status: 'pending', reason: 'measurement-edit' }); await flush();
    expect(e.noticeMessage.hidden).toBe(false);
    expect(e.noticeMessage.textContent).toContain('zakończeniu edycji');
    at(25000); e.runDueTimers();
    expect(e.api.getState().slotStatus).toBe('pending');
    expect(e.retryButton.hidden).toBe(true);
    const failed = e.api.refresh();
    e.pending[1].resolve({ status: 'error' }); await failed;
    expect(e.noticeMessage.hidden).toBe(false);
    expect(e.noticeTitle.hidden).toBe(false);
    expect(e.noticeMessage.textContent).toContain('Nie udało');
    expect(e.retryButton.hidden).toBe(false);
    const retry = e.api.retry();
    expect(e.noticeMessage.textContent).toBe('');
    expect(e.noticeMessage.hidden).toBe(true);
    e.pending[2].resolve({ status: 'ready', snapshot: e.snapshot() }); await retry;
    expect(e.api.getState().slotStatus).toBe('ready');
  });

  it('the first ready preview is fitted and shown immediately, with no opacity or transform animation', async () => {
    at();
    const e = setup({ animated: true });
    const view = await ready(e);
    expect(e.api.getState()).toMatchObject({ status: 'ready', slotStatus: 'ready' });
    expect(e.animations).toHaveLength(0);
    expect(view.element.animate).not.toHaveBeenCalled();
    expect(view.update).toHaveBeenCalledOnce();
    expect(view.fit).toHaveBeenCalled();
    expect(view.update.mock.invocationCallOrder[0]).toBeLessThan(view.fit.mock.invocationCallOrder.at(-1));
    expect(view.element.hidden).toBe(false);
    const refresh = e.api.refresh();
    e.pending[1].resolve(e.snapshot({ source: 'PALCZEWSKA', currentHeight: 161 })); await refresh;
    expect(view.update).toHaveBeenCalledTimes(2);
    expect(view.element.animate).not.toHaveBeenCalled();
    expect(view.element.hidden).toBe(false);
    expect(e.render).not.toHaveBeenCalled();
  });

  it('a same-visit refresh does not animate or replace an identical preview', async () => {
    const e = setup({ animated: true }); const view = await ready(e);
    const refresh = e.api.refresh(); e.pending[1].resolve(e.snapshot()); await refresh;
    expect(view.element.animate).not.toHaveBeenCalled();
    expect(view.update).toHaveBeenCalledOnce();
    expect(e.preview).toHaveBeenCalledOnce();
    expect(e.render).not.toHaveBeenCalled();
  });

  it.each([false, true])('hands the full drawing to the host without an inline fade (deferred crop: %s)', async deferredBounds => {
    const e = setup({ animated: true, deferredBounds }); const view = await ready(e);
    await expand(e, view);
    if (deferredBounds) {
      expect(e.open).not.toHaveBeenCalled();
      e.boundsJobs[0].resolve({ status: 'ready' }); await flush();
    }
    expect(e.open).toHaveBeenCalledOnce();
    expect(view.element.animate).not.toHaveBeenCalled();
    expect(e.api.getState().fullscreen).toBe(true);
    expect(view.update.mock.calls.at(-1)[0].height.preview).toBe(false);
  });

  it.each(['lock', 'clear', 'patient-change', 'pagehide'])('%s removes the old preview immediately and a replacement does not fade', async reason => {
    const e = setup({ animated: true }); const old = await ready(e);
    if (reason === 'pagehide') e.win.dispatchEvent({ type: 'pagehide' });
    else {
      if (reason === 'patient-change') e.replacePatient();
      else e.invalidate();
      e.emit({ reason, identityChanged: true });
    }
    expect(old.destroy).toHaveBeenCalledOnce();
    expect(old.element.hidden).toBe(true);
    expect(e.animations).toHaveLength(0);
    expect(e.render).not.toHaveBeenCalled();
    if (reason === 'pagehide' || reason === 'patient-change') {
      if (reason === 'pagehide') e.win.dispatchEvent({ type: 'pageshow', persisted: true });
      e.nextFrame(); e.runTimers();
      e.pending[1].resolve(e.snapshot()); await flush();
      expect(e.api.getState().status).toBe('ready');
      expect(e.animations).toHaveLength(0);
      expect(e.render).not.toHaveBeenCalled();
    }
  });

  it('reduced motion skips animation but keeps the same delayed loading notice', async () => {
    at();
    const e = setup({ animated: true, reducedMotion: true });
    expect(e.noticeMessage.hidden).toBe(true);
    at(11200); e.runDueTimers();
    expect(e.noticeMessage.hidden).toBe(false);
    await ready(e);
    expect(e.animations).toHaveLength(0);
    expect(e.api.getState().status).toBe('ready');
  });

  function runBootstrap(e, filename) {
    const html = fs.readFileSync(new URL(`../../${filename}`, import.meta.url), 'utf8');
    expect(html).toMatch(/id="vildaCentileLiveLoadingTitle"[^>]* hidden>/u);
    expect(html).toMatch(/<p id="vildaCentileLiveLoadingMessage" hidden><\/p>/u);
    const source = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gu)]
      .find(([, script]) => script.includes('window.__vildaCentileLivePendingSince'))?.[1];
    expect(source).toBeTruthy();
    const storage = { getItem: key => ({ vildaCurrentPatientId: 'fictional-a', vildaLoadChoiceV1: 'new' })[key] || null };
    e.win.location = { reload: vi.fn() };
    new Function('window', 'document', 'sessionStorage', source)(e.win, e.doc, storage);
  }

  it.each(['index.html', 'docpro.html'])('%s shows delayed boot feedback without the controller and preserves the 15 s error', filename => {
    at();
    const e = setup({ deferStart: true });
    runBootstrap(e, filename);
    const messageCallback = e.win.setTimeout.mock.calls.find(([, delay]) => delay === 1200)[0];
    expect(e.win.__vildaCentileLivePendingSince).toBe(10000);
    expect(e.noticeMessage.hidden).toBe(true);
    expect(e.noticeMessage.textContent).toBe('');
    at(11199); e.runDueTimers();
    expect(e.noticeMessage.hidden).toBe(true);
    at(11200); e.runDueTimers();
    expect(e.noticeMessage.textContent).toBe('Wczytywanie siatki…');
    expect(e.noticeMessage.hidden).toBe(false);
    at(25000); e.runDueTimers();
    expect(e.mount.attributes['data-centile-live-state']).toBe('error');
    expect(e.noticeMessage.textContent).toContain('Nie udało się uruchomić');
    expect(e.noticeTitle.hidden).toBe(false);
    expect(e.retryButton.hidden).toBe(false);
    messageCallback();
    expect(e.noticeMessage.textContent).toContain('Nie udało się uruchomić');
  });

  it.each(['index.html', 'docpro.html'])('%s transfers elapsed boot time and neutral ready-state callbacks cannot revive the message', async filename => {
    at();
    const e = setup({ lifecycle: true, deferStart: true, animated: true });
    runBootstrap(e, filename);
    const bootCallback = e.win.setTimeout.mock.calls.find(([, delay]) => delay === 1200)[0];
    at(10700); e.startController();
    expect(e.win.setTimeout.mock.calls.some(([, delay]) => delay === 500)).toBe(true);
    at(11199); e.runDueTimers();
    expect(e.noticeMessage.hidden).toBe(true);
    at(11200); e.runDueTimers();
    expect(e.noticeMessage.textContent).toBe('Wczytywanie siatki…');
    e.pending[0].resolve({ status: 'ready', snapshot: e.snapshot() }); await flush();
    at(25000); e.runDueTimers(); bootCallback(); e.doc.dispatchEvent({ type: 'readystatechange' });
    expect(e.noticeMessage.textContent).toBe('');
    expect(e.noticeMessage.hidden).toBe(true);
    expect(e.notice.hidden).toBe(true);
    expect(e.api.getState().slotStatus).toBe('ready');
  });

  it('the boot timer can expire before the loader markup is parsed', () => {
    at();
    const e = setup({ deferStart: true });
    const find = e.doc.getElementById;
    e.doc.getElementById = () => null;
    runBootstrap(e, 'docpro.html');
    at(11200); e.runDueTimers();
    expect(e.noticeMessage.textContent).toBe('');
    e.doc.getElementById = find;
    e.doc.dispatchEvent({ type: 'readystatechange' });
    expect(e.noticeMessage.textContent).toBe('Wczytywanie siatki…');
    expect(e.noticeMessage.hidden).toBe(false);
  });
});


describe('standalone summary chart presentation', () => {
  it('does not read or render a chart before selecting its tab, including on mobile', async () => {
    const presentation = { mode: 'summary', selected: 'summary' };
    const e = setup({ columns: '400px', lifecycle: true, summaryPresentation: presentation });
    expect(e.data.getResult).not.toHaveBeenCalled();
    expect(e.preview).not.toHaveBeenCalled();
    expect(e.render).not.toHaveBeenCalled();
    presentation.selected = 'chart';
    e.doc.dispatchEvent({ type: 'vilda:summary-chart-state' });
    expect(e.data.getResult).toHaveBeenCalledWith({ mode: 'summary' });
    e.pending[0].resolve({ status: 'ready', snapshot: e.snapshot({ patientId: null }) });
    await flush();
    expect(e.preview).toHaveBeenCalledTimes(1);
    expect(e.render).not.toHaveBeenCalled();
    expect(e.api.getState()).toMatchObject({ presentation: 'summary', selectedTab: 'chart', eligible: true });
    expect(e.classes.has('vilda-centile-live-reserved')).toBe(false);
    expect(e.mount.style['--vilda-centile-live-inline-height']).toBe('518px');
    await expand(e);
    expect(e.render).toHaveBeenCalledTimes(1);
    expect(e.open).toHaveBeenCalledTimes(1);
  });

  it('cancels pending expansion synchronously on selecting Summary and never publishes its result', async () => {
    const presentation = { mode: 'summary', selected: 'chart' };
    const e = setup({ lifecycle: true, deferredBounds: true, summaryPresentation: presentation });
    e.pending[0].resolve({ status: 'ready', snapshot: e.snapshot() }); await flush();
    await expand(e);
    expect(e.boundsJobs).toHaveLength(1);
    presentation.selected = 'summary';
    e.doc.dispatchEvent({ type: 'vilda:summary-chart-state' });
    expect(e.views[0].destroy).toHaveBeenCalledTimes(1);
    expect(e.boundsJobs[0].cancel).toHaveBeenCalled();
    e.boundsJobs[0].resolve({ status: 'ready' }); await flush();
    expect(e.open).not.toHaveBeenCalled();
    expect(e.data.getResult).toHaveBeenCalledTimes(1);
  });

  it('reuses the dedicated controller only when the comparison presentation is selected', async () => {
    const presentation = { mode: 'summary', selected: 'summary' };
    const e = setup({ lifecycle: true, summaryPresentation: presentation });
    presentation.mode = 'dedicated';
    e.doc.dispatchEvent({ type: 'vilda:summary-chart-state' });
    expect(e.data.getResult).toHaveBeenCalledWith(undefined);
    e.pending[0].resolve({ status: 'ready', snapshot: e.snapshot() }); await flush();
    expect(e.classes.has('vilda-centile-live-reserved')).toBe(true);
    expect(e.views).toHaveLength(1);
  });
});
