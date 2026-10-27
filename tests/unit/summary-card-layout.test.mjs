import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function setup({ columns = '400px 400px', contentHeight = 1100, hidden = false } = {}) {
  const nodes = new Map(), listeners = new Map(), frames = new Map(), observed = [], mutations = [];
  let sequence = 0;
  function element(id, rect = {}, computed = {}) {
    const attributes = new Map(), classes = new Set(), handlers = new Map(), properties = new Map();
    let hiddenState = false;
    const node = {
      id, computed, children: [], scrollTop: 0,
      get hidden() { return hiddenState; },
      set hidden(value) { hiddenState = value; mutations.push({ node: this.id, attribute: 'hidden' }); },
      rect: { left: 0, top: 100, width: 400, height: 800, ...rect },
      style: {
        getPropertyValue: name => properties.get(name) || '',
        setProperty: vi.fn((name, value) => { properties.set(name, value); mutations.push({ node: id, attribute: 'style' }); }),
        removeProperty: name => { properties.delete(name); mutations.push({ node: id, attribute: 'style' }); },
      },
      classList: {
        // Browsers report add/remove calls even when the class set is unchanged.
        add: name => { classes.add(name); mutations.push({ node: id, attribute: 'class' }); },
        remove: name => { classes.delete(name); mutations.push({ node: id, attribute: 'class' }); },
        contains: name => classes.has(name),
        toggle: (name, enabled) => {
          if (classes.has(name) !== enabled) mutations.push({ node: id, attribute: 'class' });
          return enabled ? classes.add(name) : classes.delete(name);
        },
      },
      setAttribute: (name, value) => { attributes.set(name, value); mutations.push({ node: id, attribute: name }); },
      getAttribute: name => attributes.get(name) ?? null,
      removeAttribute: name => { if (attributes.delete(name)) mutations.push({ node: id, attribute: name }); },
      getClientRects: () => node.hidden ? [] : [{}],
      getBoundingClientRect: vi.fn(() => ({ ...node.rect, right: node.rect.left + node.rect.width, bottom: node.rect.top + node.rect.height })),
      appendChild: child => { node.children.push(child); nodes.set(child.id, child); },
      addEventListener: (name, callback) => handlers.set(name, callback),
      fire: name => handlers.get(name)?.(),
    };
    nodes.set(id, node);
    return node;
  }
  const form = element('calcForm', { height: 5000 }, { gridTemplateColumns: columns });
  const fieldset = element('fieldset');
  const doctor = element('doctorSection', { left: 420 });
  const card = element('currentSummaryCard', { left: 420, top: 140 }, { paddingBottom: '20px', borderBottomWidth: '1px' });
  const content = element('currentSummaryContent', { left: 440, top: 220 });
  const puberty = element('tannerStageWrap', { height: 320 }, { display: 'none' });
  element('currentSummaryWrap');
  element('vildaStatusSide');
  card.hidden = hidden;
  content.naturalHeight = contentHeight;
  Object.defineProperties(content, {
    scrollHeight: { get: () => content.naturalHeight },
    clientHeight: { get: () => Math.min(content.naturalHeight, card.classList.contains('vilda-summary-height-matched')
      ? parseFloat(content.style.getPropertyValue('--vilda-summary-content-height')) || Infinity : Infinity) },
  });
  const doc = {
    readyState: 'complete',
    querySelector: selector => selector === '#userSection fieldset.user-card' ? fieldset : null,
    getElementById: id => nodes.get(id) || null,
    createElement: () => element('', { height: 23 }, { marginTop: '6px' }),
    addEventListener: (name, callback) => listeners.set(name, callback),
  };
  const win = {
    document: doc, getComputedStyle: node => node.computed,
    addEventListener: (name, callback) => listeners.set(name, callback),
    requestAnimationFrame: callback => { const id = ++sequence; frames.set(id, callback); return id; },
    ResizeObserver: class { constructor(callback) { this.callback = callback; } observe(node) { observed.push({ node, callback: this.callback }); } },
  };
  loadBrowserScript('vilda_summary_layout.js', win);
  return {
    api: win.VildaSummaryLayout, form, fieldset, doctor, card, content, puberty,
    hint: nodes.get('vildaSummaryScrollHint'), observed, mutations,
    event: name => listeners.get(name)?.(),
    resize: () => observed.forEach(item => item.callback()),
    flush: () => { for (const [id, callback] of [...frames]) { frames.delete(id); callback(); } },
    pendingFrames: () => frames.size,
  };
}

describe('summary card — measured two-column layout', () => {
  it.each([
    ['hidden comparison summary', { hidden: true }],
    ['overflowing summary', {}],
    ['short summary', { contentHeight: 450 }],
    ['stacked phone summary', { columns: '400px' }],
  ])('does not retrigger DOM observers for an unchanged %s', (_, options) => {
    const e = setup(options);
    e.mutations.length = 0;
    for (let index = 0; index < 3; index += 1) {
      e.api.refresh();
      e.event('vilda:professional-summary-updated');
      e.resize(); e.flush();
      e.content.fire('scroll');
    }
    expect(e.mutations).toEqual([]);
  });

  it('writes genuine size and visibility changes once, then settles without observer feedback', () => {
    const e = setup();
    e.fieldset.rect.height = 850;
    e.api.refresh();
    expect(e.card.style.getPropertyValue('--vilda-summary-card-height')).toBe('810px');
    expect(e.content.style.getPropertyValue('--vilda-summary-content-height')).toBe('680px');
    e.card.hidden = true;
    e.api.refresh();
    expect(e.card.classList.contains('vilda-summary-height-matched')).toBe(false);
    expect(e.hint.hidden).toBe(true);
    e.mutations.length = 0;
    e.api.refresh();
    expect(e.mutations).toEqual([]);
    e.card.hidden = false;
    e.api.refresh();
    expect(e.card.classList.contains('vilda-summary-height-matched')).toBe(true);
    expect(e.hint.hidden).toBe(false);
    e.mutations.length = 0;
    e.api.refresh();
    expect(e.mutations).toEqual([]);
  });

  it('aligns the bottom with the actual form, allowing the status strip above it', () => {
    const e = setup();
    expect(e.card.style.getPropertyValue('--vilda-summary-card-height')).toBe('760px');
    expect(e.card.rect.top + 760).toBe(e.fieldset.rect.top + e.fieldset.rect.height);
    expect(e.content.style.getPropertyValue('--vilda-summary-content-height')).toBe('630px');
    expect(e.content.getAttribute('tabindex')).toBe('0');
    expect(e.content.getAttribute('role')).toBe('region'); // Adult summaries also have an accessible scroll region.
    expect(e.content.getAttribute('aria-label')).toBe('Podsumowanie wyników');
    expect(e.hint.hidden).toBe(false);
    expect(e.hint.style.getPropertyValue('--vilda-summary-hint-bottom')).toBe('21px');
    // No change to the form, including no artificial minimum height.
    expect(e.fieldset.style.setProperty).not.toHaveBeenCalled();
  });

  it('keeps short summaries natural inside the matched card until extra results need scrolling', () => {
    const e = setup({ contentHeight: 450 });
    expect(e.hint.hidden).toBe(true);
    expect(e.content.getAttribute('tabindex')).toBe(null);
    e.content.naturalHeight = 1600;
    e.content.fire('toggle');
    e.flush();
    expect(e.card.style.getPropertyValue('--vilda-summary-card-height')).toBe('760px');
    expect(e.content.clientHeight).toBe(630);
    expect(e.hint.hidden).toBe(false);
    e.content.scrollTop = e.content.scrollHeight - e.content.clientHeight;
    const writes = e.content.style.setProperty.mock.calls.length;
    e.content.fire('scroll');
    expect(e.hint.classList.contains('vilda-summary-scroll-hint-at-end')).toBe(true);
    expect(e.content.style.setProperty).toHaveBeenCalledTimes(writes);
    e.content.scrollTop = 0;
    e.content.fire('scroll');
    expect(e.hint.classList.contains('vilda-summary-scroll-hint-at-end')).toBe(false);
  });

  it('removes constraints on stacked phone layouts and reapplies them in native landscape columns', () => {
    const e = setup();
    e.form.computed.gridTemplateColumns = '400px';
    e.event('resize'); e.flush();
    expect(e.card.classList.contains('vilda-summary-height-matched')).toBe(false);
    expect(e.card.style.getPropertyValue('--vilda-summary-card-height')).toBe('');
    expect(e.content.style.getPropertyValue('--vilda-summary-content-height')).toBe('');
    expect(e.content.getAttribute('tabindex')).toBe(null);
    expect(e.content.clientHeight).toBe(e.content.scrollHeight);
    expect(e.hint.hidden).toBe(true);
    e.form.computed.gridTemplateColumns = '400px 400px';
    e.event('resize'); e.flush();
    expect(e.card.classList.contains('vilda-summary-height-matched')).toBe(true);
    expect(e.card.style.getPropertyValue('--vilda-summary-card-height')).toBe('760px');
  });

  it('preserves the collapsed target when Tanner opens, without using the overall grid height', () => {
    const e = setup();
    e.puberty.computed.display = 'block';
    e.fieldset.rect.height = 1144;
    e.form.rect.height = 9000;
    e.resize(); e.resize();
    expect(e.pendingFrames()).toBe(1);
    e.flush();
    expect(e.card.style.getPropertyValue('--vilda-summary-card-height')).toBe('760px');
    expect(e.pendingFrames()).toBe(0);
    e.puberty.computed.display = 'none';
    e.fieldset.rect.height = 850;
    e.resize(); e.flush();
    expect(e.card.style.getPropertyValue('--vilda-summary-card-height')).toBe('810px');
  });

  it('keeps the card height when selecting the chart, but removes the summary cue and focus stop', () => {
    const e = setup();
    e.content.hidden = true;
    e.event('vilda:summary-chart-state');
    expect(e.card.style.getPropertyValue('--vilda-summary-card-height')).toBe('760px');
    expect(e.hint.hidden).toBe(true);
    expect(e.content.getAttribute('tabindex')).toBe(null);
    e.content.hidden = false;
    e.content.setAttribute('role', 'tabpanel');
    e.content.setAttribute('aria-labelledby', 'vildaSummaryTab');
    e.event('vilda:summary-chart-state');
    expect(e.content.getAttribute('role')).toBe('tabpanel');
    expect(e.content.getAttribute('aria-labelledby')).toBe('vildaSummaryTab');
    expect(e.content.getAttribute('tabindex')).toBe('0');
  });

  it('never exposes a summary hidden by the comparison lifecycle', () => {
    const e = setup({ hidden: true });
    expect(e.card.hidden).toBe(true);
    expect(e.card.classList.contains('vilda-summary-height-matched')).toBe(false);
    expect(e.hint.hidden).toBe(true);
    e.card.hidden = false;
    e.event('vilda:professional-summary-updated');
    expect(e.card.classList.contains('vilda-summary-height-matched')).toBe(true);
    e.card.hidden = true;
    e.event('vilda:professional-summary-updated');
    expect(e.card.classList.contains('vilda-summary-height-matched')).toBe(false);
    expect(e.hint.hidden).toBe(true);
  });
});
