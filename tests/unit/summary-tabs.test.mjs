import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function setup({ available = true, child = true, comparison = false, pending = false, missingController = false, readyState = 'complete' } = {}) {
  const elements = [], subscribers = [], listeners = new Map();
  function element(tag = 'div') {
    const classes = new Set(), events = new Map();
    const node = { tagName: tag.toUpperCase(), children: [], parentNode: null, dataset: {}, attributes: {}, hidden: false,
      setAttribute(key, value) { this.attributes[key] = value; }, removeAttribute(key) { delete this.attributes[key]; },
      classList: { toggle(key, active) { if (active) classes.add(key); else classes.delete(key); }, contains: key => classes.has(key) },
      appendChild(child) { this.insertBefore(child, null); },
      insertBefore(child, before) {
        if (child.parentNode) child.parentNode.children.splice(child.parentNode.children.indexOf(child), 1);
        const at = before ? this.children.indexOf(before) : -1;
        if (at < 0) this.children.push(child); else this.children.splice(at, 0, child);
        child.parentNode = this;
      },
      querySelector(selector) { return selector === 'h3' ? this.children.find(c => c.tagName === 'H3') : null; },
      addEventListener(type, callback) { events.set(type, callback); },
      fire(type, fields = {}) { const event = { type, preventDefault: vi.fn(), ...fields }; events.get(type)?.(event); return event; },
      focus: vi.fn(),
      get nextSibling() { return this.parentNode?.children[this.parentNode.children.indexOf(this) + 1] || null; },
    };
    elements.push(node); return node;
  }
  const home = element(), card = element(), content = element(), heading = element('h3'), mount = element();
  card.id = 'currentSummaryCard'; content.id = 'currentSummaryContent'; mount.id = 'vildaCentileLiveMount';
  card.dataset = { summaryAvailable: String(available), comparisonVisible: String(comparison), isChild: String(child) };
  home.appendChild(mount); home.appendChild(card); card.appendChild(heading); card.appendChild(content);
  const doc = { readyState, documentElement: { classList: { remove: vi.fn() } }, getElementById: id => elements.find(e => e.id === id), createElement: element,
    createComment: () => element('#comment'),
    addEventListener(type, callback) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(callback); },
    dispatchEvent(event) { for (const callback of listeners.get(event.type) || []) callback(event); },
  };
  const win = { document: doc, clearTimeout: vi.fn(), location: { reload: vi.fn() }, VildaCentileLivePanel: missingController ? undefined : {}, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    VildaCentileLiveData: { getEligibility: () => ({ status: pending ? 'pending' : 'eligible' }), subscribe: fn => subscribers.push(fn) } };
  const changes = []; doc.addEventListener('vilda:summary-chart-state', event => changes.push(event.detail));
  loadBrowserScript('vilda_summary_tabs.js', win);
  return { win, doc, card, content, heading, mount, home, changes,
    summary: doc.getElementById('vildaSummaryTab'), chart: doc.getElementById('vildaSummaryChartTab'),
    panel: doc.getElementById('vildaSummaryChartPanel'),
    report: detail => doc.dispatchEvent({ type: 'vilda:professional-summary-updated', detail }),
    signal: event => subscribers.forEach(fn => fn(event)),
    setPending: value => { pending = value; },
  };
}

describe('professional summary tabs — stable DOM and chart ownership', () => {
  it('defaults to summary and moves the sole chart mount into the tab panel', () => {
    const e = setup();
    expect(e.win.VildaSummaryTabs.getState()).toEqual({ mode: 'summary', selected: 'summary' });
    expect(e.mount.parentNode).toBe(e.panel);
    expect(e.panel.hidden).toBe(true);
    expect(e.content.hidden).toBe(false);
    expect(e.heading.hidden).toBe(true);
    expect(e.summary.attributes).toMatchObject({ role: 'tab', 'aria-selected': 'true', 'aria-controls': 'currentSummaryContent' });
  });

  it('keeps both buttons and selected chart through result updates caused by blur', () => {
    const e = setup();
    e.chart.fire('click');
    e.chart.fire('click'); // Already selected: no redundant chart teardown.
    const button = e.chart;
    e.report({ available: true, comparisonVisible: false, isChild: true });
    expect(e.doc.getElementById('vildaSummaryChartTab')).toBe(button);
    expect(e.win.VildaSummaryTabs.getState().selected).toBe('chart');
    expect(e.panel.hidden).toBe(false);
    expect(e.content.hidden).toBe(true);
    expect(e.changes).toHaveLength(2); // Initial placement and explicit selection only.
  });

  it('implements roving focus and keyboard selection without a form submit', () => {
    const e = setup();
    const event = e.summary.parentNode.fire('keydown', { key: 'End' });
    expect(event.preventDefault).toHaveBeenCalled();
    expect(e.chart.focus).toHaveBeenCalled();
    expect(e.summary.tabIndex).toBe(-1);
    expect(e.chart.tabIndex).toBe(0);
    e.summary.parentNode.fire('keydown', { key: 'Home' });
    expect(e.summary.focus).toHaveBeenCalled();
    expect(e.content.hidden).toBe(false);
    expect(e.summary.type).toBe('button');
  });

  it('resets selection on an ownership change and moves the mount home for comparison', () => {
    const e = setup();
    e.chart.fire('click');
    e.signal({ identityChanged: true, reason: 'patient-change' });
    expect(e.panel.hidden).toBe(true);
    e.report({ available: true, comparisonVisible: true, isChild: true });
    expect(e.mount.parentNode).toBe(e.home);
    expect(e.win.VildaSummaryTabs.getState().mode).toBe('dedicated');
    expect(e.content.hidden).toBe(false);
    expect(e.heading.hidden).toBe(false);
    expect(e.content.attributes.role).toBeUndefined();
  });

  it('leaves the reserved dedicated slot during restore until ownership settles', () => {
    const e = setup({ pending: true });
    expect(e.mount.parentNode).toBe(e.home);
    expect(e.win.VildaSummaryTabs.getState().mode).toBe('dedicated');
    e.setPending(false); e.signal({ reason: 'startup-settled' });
    expect(e.mount.parentNode).toBe(e.panel);
    expect(e.win.VildaSummaryTabs.getState()).toEqual({ mode: 'summary', selected: 'summary' });
  });

  it('keeps a selected chart in its summary slot during a same-owner save acknowledgement', () => {
    const e = setup();
    e.chart.fire('click');
    e.setPending(true);
    e.signal({ reason: 'patient-saved', identityChanged: false });
    e.report({ available: true, comparisonVisible: false, isChild: true });
    expect(e.win.VildaSummaryTabs.getState()).toEqual({ mode: 'summary', selected: 'chart' });
    expect(e.mount.parentNode).toBe(e.panel);
    expect(e.changes).toHaveLength(2);
  });

  it('waits for deferred scripts before deciding that the controller failed', () => {
    const e = setup({ missingController: true, readyState: 'interactive' });
    expect(e.mount.attributes['data-centile-live-state']).toBeUndefined();
    e.win.VildaCentileLivePanel = {};
    e.doc.dispatchEvent({ type: 'DOMContentLoaded' });
    expect(e.mount.attributes['data-centile-live-state']).toBeUndefined();
    expect(e.panel.hidden).toBe(true);
  });

  it('keeps Summary usable if the deferred chart controller failed and exposes its error only inside Chart', () => {
    const e = setup({ missingController: true });
    expect(e.content.hidden).toBe(false);
    expect(e.panel.hidden).toBe(true);
    expect(e.mount.attributes['data-centile-live-state']).toBe('error');
    expect(e.panel.attributes['data-chart-state']).toBe('error');
    e.chart.fire('click');
    expect(e.content.hidden).toBe(true);
    expect(e.panel.hidden).toBe(false);
    expect(e.mount.hidden).toBe(false);
    expect(e.win.location.reload).not.toHaveBeenCalled();
    e.summary.fire('click');
    expect(e.content.hidden).toBe(false);
    expect(e.panel.hidden).toBe(true);
  });

  it.each([{ child: false }, { available: false }, { comparison: true }])('does not expose pediatric chart tabs for %o', options => {
    const e = setup(options);
    expect(e.summary.parentNode.hidden).toBe(true);
    expect(e.mount.parentNode).toBe(e.home);
  });
});
