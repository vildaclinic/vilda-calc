import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function emitter(target) {
  const listeners = new Map();
  target.addEventListener = (type, fn) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
  };
  target.dispatchEvent = (event) => { for (const fn of listeners.get(event.type) || []) fn(event); };
  return target;
}

function setup({ columns = '400px 400px', rects = true } = {}) {
  const pending = [], subscribers = [], views = [], hosts = [], frames = new Map(), timers = new Map(), resizeObservers = [];
  let id = 0, currentToken = Object.freeze({ fictional: 'patient-a', revision: 1 });
  let refreshState = null;
  function element(rect = {}) {
    return {
      hidden: false, style: { setProperty(name, value) { this[name] = value; } }, children: [], parentNode: null,
      rect: { left: 0, right: 400, top: 0, bottom: 800, width: 400, height: 800, ...rect },
      getBoundingClientRect() { return this.rect; },
      getClientRects() { return this.hidden ? [] : [{}]; },
      appendChild(child) { this.children.push(child); child.parentNode = this; },
      remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; },
    };
  }
  const form = element(), fieldset = element(), doctor = element({ left: 420, right: 820 }), mount = element({ left: 420, right: 820, top: 30 }), puberty = element({ height: 320 }), strip = element();
  mount.hidden = true;
  form.getClientRects = () => rects ? [{}] : [];
  const classes = new Set();
  const doc = emitter({ readyState: 'complete', documentElement: { classList: {
    toggle: (name, value) => value ? classes.add(name) : classes.delete(name),
  } },
  getElementById: (name) => ({ calcForm: form, doctorSection: doctor, vildaCentileLiveMount: mount, tannerStageWrap: puberty, vildaStatusSide: strip })[name] || null,
  querySelector: (selector) => selector === '#userSection fieldset.user-card' ? fieldset : null,
  });
  const style = { columns, pubertyDisplay: 'none', pubertyMarginTop: '12px', pubertyMarginBottom: '12px' };
  const data = {
    getSnapshot: vi.fn(() => new Promise((resolve, reject) => { pending.push({ resolve, reject }); })),
    isCurrent: vi.fn((candidate) => Boolean(candidate && (candidate.patientToken || candidate) === currentToken)),
    getRefreshState: vi.fn(() => refreshState),
    subscribe: (fn) => { subscribers.push(fn); return () => {}; },
  };
  const render = vi.fn((snapshot) => ({ status: 'ready', source: snapshot.source, height: {}, weight: {} }));
  const win = emitter({ document: doc, VildaCentileLiveData: data, __vildaRemindersResync: vi.fn(),
    getComputedStyle: (node) => node.computedStyle || (node === form ? { gridTemplateColumns: style.columns } : {
      display: node === puberty ? style.pubertyDisplay : 'block', marginTop: style.pubertyMarginTop, marginBottom: style.pubertyMarginBottom,
    }),
    requestAnimationFrame: (fn) => { const key = ++id; frames.set(key, fn); return key; },
    setTimeout: (fn) => { const key = ++id; timers.set(key, fn); return key; },
    clearTimeout: (key) => timers.delete(key),
    ResizeObserver: class { constructor(fn) { resizeObservers.push(fn); } observe() {} },
    VildaCentileLiveRender: { render, probe: vi.fn() },
    VildaCentileLiveView: { create: vi.fn((options) => {
      const state = { metric: 'height', fullscreen: false };
      const view = {
        options, element: element(), expandButton: element(),
        fit: vi.fn(), update: vi.fn(), setStatus: vi.fn(),
        setFullscreen: vi.fn((value) => { state.fullscreen = value; }),
        setMetric: (value) => { state.metric = value; },
        destroy: vi.fn(() => view.element.remove()), getState: () => ({ ...state }),
      };
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
  loadBrowserScript('vilda_centile_live_panel.js', win);
  const snapshot = (extra = {}) => ({ patientToken: currentToken, patientId: currentToken?.fictional || null,
    source: 'OLAF', ageMonths: 158, measurements: [], ...extra });
  return { win, doc, data, pending, views, hosts, open, render, snapshot, style, classes, mount, fieldset, doctor, form, puberty,
    api: win.VildaCentileLivePanel, element,
    emit: (event) => subscribers.forEach((fn) => fn(event)),
    replacePatient: (name = 'patient-b') => { currentToken = Object.freeze({ fictional: name, revision: 2 }); },
    invalidate: () => { currentToken = null; },
    setRefreshState: (value) => { refreshState = value; },
    nextFrame: () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((fn) => fn()); },
    runTimers: () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach((fn) => fn()); },
    resize: () => resizeObservers.forEach((fn) => fn()),
  };
}

const flush = async () => { for (let index = 0; index < 6; index++) await Promise.resolve(); };
async function ready(e) { e.pending[0].resolve(e.snapshot()); await flush(); return e.views[0]; }

describe('live panel controller — async ownership and invalidation', () => {
  it('keeps the mounted weight chart and fullscreen while a same-visit save defers its next snapshot', async () => {
    const e = setup(); const view = await ready(e);
    view.setMetric('weight'); view.options.onExpand();
    const height = e.mount.style['--vilda-centile-live-inline-height'];
    e.setRefreshState('pending');
    e.emit({ identityChanged: false, reason: 'patient-loaded' });
    expect(view.destroy).not.toHaveBeenCalled();
    e.runTimers(); e.pending[1].resolve(null); await flush();
    expect(e.api.getState()).toMatchObject({ eligible: true, fullscreen: true, metric: 'weight' });
    expect(e.hosts[0].options.isCurrent(e.hosts[0].options.patientToken)).toBe(true);
    expect(e.hosts[0].close).not.toHaveBeenCalled();
    expect(e.mount.hidden).toBe(false);
    expect(e.mount.style['--vilda-centile-live-inline-height']).toBe(height);
    expect(e.win.__vildaRemindersResync).not.toHaveBeenCalled();
    e.setRefreshState(null);
    e.emit({ identityChanged: false, reason: 'vilda:dob-restored' });
    e.runTimers(); e.pending[2].resolve(e.snapshot({ currentHeight: 159 })); await flush();
    expect(e.views).toHaveLength(1);
    expect(view.update).toHaveBeenCalledTimes(2);
    expect(e.api.getState()).toMatchObject({ eligible: true, fullscreen: true, metric: 'weight' });
    expect(view.destroy).not.toHaveBeenCalled();
  });

  it('shows a concrete refresh failure in the same view and recovers without resetting its metric', async () => {
    const e = setup(); const view = await ready(e);
    view.setMetric('weight');
    e.setRefreshState('error');
    const failed = e.api.refresh(); e.pending[1].resolve(null); await failed;
    expect(e.api.getState()).toMatchObject({ status: 'unavailable', metric: 'weight', eligible: true });
    expect(view.setStatus).toHaveBeenCalledWith(expect.stringContaining('odświeżyć siatki po zapisie'));
    expect(e.win.__vildaRemindersResync).not.toHaveBeenCalled();
    e.setRefreshState(null);
    const recovered = e.api.refresh(); e.pending[2].resolve(e.snapshot()); await recovered;
    expect(e.api.getState()).toMatchObject({ status: 'ready', metric: 'weight' });
    expect(e.views).toHaveLength(1);
    expect(view.update).toHaveBeenCalledTimes(2);
  });

  it.each(['owner', 'columns'])('a pending save never keeps a chart after %s invalidation', async kind => {
    const e = setup(); const view = await ready(e);
    view.options.onExpand(); e.setRefreshState('pending');
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
    expect(e.render).toHaveBeenCalledTimes(1);
    expect(e.render).toHaveBeenCalledWith(newer);
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
    expect(e.mount.hidden).toBe(true);
    e.runTimers();
    const next = e.snapshot(); e.pending[1].resolve(next); await flush();
    expect(e.render).toHaveBeenCalledWith(next);
    expect(e.api.getState().patientId).toBe('patient-b');
  });

  it('clears a fullscreen view synchronously and late snapshots cannot resurrect it', async () => {
    const e = setup(); const view = await ready(e);
    view.options.onExpand();
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
    expect(e.render).toHaveBeenCalledTimes(1);
    expect(e.views).toHaveLength(1);
    expect(e.api.getState().eligible).toBe(false);
  });

  it('closes a fullscreen card with the lock reason and cannot reopen from stale callbacks', async () => {
    const e = setup(); const view = await ready(e);
    view.options.onExpand();
    e.invalidate(); e.emit({ identityChanged: true, reason: 'lock' });
    expect(e.hosts[0].close).toHaveBeenCalledWith('lock');
    view.options.onExpand();
    expect(e.open).toHaveBeenCalledTimes(1);
    expect(view.destroy).toHaveBeenCalledOnce();
  });

  it('passes the opaque patient token to host and refuses a superseded view owner', async () => {
    const e = setup(); const oldView = await ready(e);
    oldView.options.onExpand();
    const options = e.hosts[0].options;
    expect(options.sourceWindow).toBe(e.win);
    expect(options.element).toBe(oldView.element);
    expect(options.isCurrent(options.patientToken)).toBe(true);
    e.replacePatient(); e.emit({ identityChanged: true, reason: 'patient-loaded' });
    expect(options.isCurrent(options.patientToken)).toBe(false);
    e.runTimers(); e.pending[1].resolve(e.snapshot()); await flush();
    expect(e.views).toHaveLength(2);
    expect(options.isCurrent(options.patientToken)).toBe(false);
    expect(e.views[1].destroy).not.toHaveBeenCalled();
  });

  it('avoids rebuilding canvases for an identical snapshot but renders changed measurements and source', async () => {
    const e = setup(); await ready(e);
    let refresh = e.api.refresh(); e.pending[1].resolve(e.snapshot()); await refresh;
    expect(e.render).toHaveBeenCalledTimes(1);
    refresh = e.api.refresh(); e.pending[2].resolve(e.snapshot({ currentHeight: 159 })); await refresh;
    expect(e.render).toHaveBeenCalledTimes(2);
    refresh = e.api.refresh(); e.pending[3].resolve(e.snapshot({ currentHeight: 159, source: 'PALCZEWSKA' })); await refresh;
    expect(e.render).toHaveBeenCalledTimes(3);
  });

  it('hides the card when eligibility disappears during the snapshot await', async () => {
    const e = setup();
    e.style.columns = '400px';
    e.pending[0].resolve(e.snapshot()); await flush();
    expect(e.views).toHaveLength(0);
    expect(e.render).not.toHaveBeenCalled();
    expect(e.mount.hidden).toBe(true);
  });

  it('surfaces a renderer exception through the current view status and recovers on a later refresh', async () => {
    const e = setup();
    e.render.mockImplementationOnce(() => { throw new Error('Synthetic renderer unavailable'); });
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
    view.options.onExpand(); await flush();
    view.options.onExpand();
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
    for (const mode of ['startup-open', 'resize-open']) {
      const e = setup();
      e.mount.rect.top = 0;
      if (mode === 'resize-open') {
        await ready(e);
        expect(e.mount.style['--vilda-centile-live-inline-height']).toBe('800px');
        e.fieldset.rect.width = 420; e.fieldset.rect.right = 420;
        e.doctor.rect.left = 440;
        e.style.columns = '420px 420px';
      }
      e.style.pubertyDisplay = 'block';
      e.fieldset.rect.height = 1090.9375;
      e.puberty.rect.height = 329.859;
      const before = e.element({ bottom: 627.375 });
      const after = e.element({ top: 981.234 });
      before.computedStyle = { marginBottom: '0px' };
      after.computedStyle = { marginTop: '11.2px' };
      e.puberty.previousElementSibling = before;
      e.puberty.nextElementSibling = after;
      if (mode === 'startup-open') await ready(e);
      else { e.resize(); e.nextFrame(); }
      // 1090.9375 - (981.234 - 627.375 - 11.2) = 748.2785.
      expect(e.mount.style['--vilda-centile-live-inline-height'], mode).toBe('748px');
    }
  });

  it('removes an existing fullscreen view when the computed form becomes one column', async () => {
    const e = setup(); const view = await ready(e);
    view.options.onExpand();
    e.style.columns = '800px'; e.resize(); e.nextFrame();
    expect(e.hosts[0].close).toHaveBeenCalledWith('stale');
    expect(view.destroy).toHaveBeenCalledOnce();
    expect(e.api.getState().eligible).toBe(false);
    expect(e.classes.has('vilda-centile-live-active')).toBe(false);
  });
});
